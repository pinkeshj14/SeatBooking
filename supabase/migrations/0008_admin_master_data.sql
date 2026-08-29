-- ============================================================================
-- 0008_admin_master_data.sql
--
-- 1. Adds users.is_active so admins can deactivate accounts without deleting
--    them, and wires that into the write RPCs / self-update guard.
-- 2. Syncs auth.users.email -> public.users.email whenever an admin changes
--    a login email via the Auth Admin API.
-- 3. Fixes seat_releases so releasing/extending a period MERGES with any
--    existing overlapping-or-adjacent release for the same seat+owner
--    instead of inserting a second, overlapping row (the reported
--    duplicate-availability bug). Applied via a shared internal helper used
--    by both release_seat_range() and the auto-release path inside
--    _book_seat_range_internal(), plus a one-time cleanup of any duplicates
--    already sitting in the table.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- users.is_active
-- ----------------------------------------------------------------------------
alter table public.users
  add column if not exists is_active boolean not null default true;

-- ----------------------------------------------------------------------------
-- guard_users_self_update(): extend to also protect is_active — an employee
-- must not be able to reactivate/deactivate themselves via a raw update.
-- ----------------------------------------------------------------------------
create or replace function public.guard_users_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.default_location_id is distinct from old.default_location_id
     or new.default_seat_id is distinct from old.default_seat_id
     or new.is_active is distinct from old.is_active then
    raise exception 'Only an admin can change role, seat assignment, or active status';
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- is_active_actor(): true when the calling user's account is active (or the
-- row is missing, e.g. mid-signup — fail open there rather than locking out
-- a brand new user before their profile row exists).
-- ----------------------------------------------------------------------------
create or replace function public.is_active_actor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_active from public.users where id = auth.uid()), true);
$$;

-- ----------------------------------------------------------------------------
-- sync_user_email(): keep public.users.email in lockstep with auth.users.email
-- whenever it changes (e.g. an admin updates it via the Auth Admin API).
-- ----------------------------------------------------------------------------
create or replace function public.sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_user_email();

-- ----------------------------------------------------------------------------
-- admin_set_user_active(): flips the app-level active flag. Login-level
-- enforcement (banning the Supabase Auth account) happens separately via the
-- Auth Admin API from the server action, since that requires the service
-- role key rather than SQL.
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_user_active(
  p_user_id uuid,
  p_is_active boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can activate/deactivate a user';
  end if;

  update public.users set is_active = p_is_active where id = p_user_id;

  perform public.log_activity(auth.uid(), case when p_is_active then 'ADMIN_ACTIVATE_USER' else 'ADMIN_DEACTIVATE_USER' end,
    null, null, jsonb_build_object('user_id', p_user_id));
end;
$$;

-- ----------------------------------------------------------------------------
-- admin_upsert_seat(): create-or-update a seat by id (id null/omitted =
-- create). Used by both the single-seat editor and the bulk Excel import.
-- ----------------------------------------------------------------------------
create or replace function public.admin_upsert_seat(
  p_id uuid,
  p_location_id uuid,
  p_seat_number text,
  p_row_idx int,
  p_col_idx int,
  p_is_active boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can create or edit seats';
  end if;

  if p_id is not null then
    update public.seats
    set location_id = p_location_id,
        seat_number = p_seat_number,
        row_idx = coalesce(p_row_idx, row_idx),
        col_idx = coalesce(p_col_idx, col_idx),
        is_active = p_is_active
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Seat % not found', p_id;
    end if;
  else
    insert into public.seats (location_id, seat_number, row_idx, col_idx, is_active)
    values (p_location_id, p_seat_number, coalesce(p_row_idx, 0), coalesce(p_col_idx, 0), p_is_active)
    returning id into v_id;
  end if;

  perform public.log_activity(auth.uid(), 'ADMIN_UPSERT_SEAT', v_id, p_location_id,
    jsonb_build_object('seat_number', p_seat_number));

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Seat release merge fix
-- ----------------------------------------------------------------------------
create or replace function public._upsert_seat_release(
  p_user_id uuid,
  p_seat_id uuid,
  p_start_date date,
  p_end_date date,
  p_reason text,
  p_actor uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_release_id uuid;
  v_merged_start date := p_start_date;
  v_merged_end date := p_end_date;
  v_existing_reason text;
  v_overlap record;
begin
  select reason into v_existing_reason
  from public.seat_releases
  where seat_id = p_seat_id
    and user_id = p_user_id
    and start_date <= (p_end_date + 1)
    and end_date >= (p_start_date - 1)
  order by created_at desc
  limit 1;

  -- Merge with every existing release for this seat+owner that overlaps or
  -- is adjacent to (touches) the new range, so a re-release / date-extension
  -- updates the existing record instead of adding a second, overlapping one.
  for v_overlap in
    select id, start_date, end_date
    from public.seat_releases
    where seat_id = p_seat_id
      and user_id = p_user_id
      and start_date <= (v_merged_end + 1)
      and end_date >= (v_merged_start - 1)
  loop
    v_merged_start := least(v_merged_start, v_overlap.start_date);
    v_merged_end := greatest(v_merged_end, v_overlap.end_date);
    delete from public.seat_releases where id = v_overlap.id;
  end loop;

  insert into public.seat_releases (user_id, seat_id, start_date, end_date, reason, created_by)
  values (p_user_id, p_seat_id, v_merged_start, v_merged_end, coalesce(p_reason, v_existing_reason), p_actor)
  returning id into v_release_id;

  return v_release_id;
end;
$$;

-- Internal helper only — never callable directly via the client RPC API.
revoke all on function public._upsert_seat_release(uuid, uuid, date, date, text, uuid) from public, anon, authenticated;

-- release_seat_range(): now routes through the merge-aware upsert helper,
-- and also blocks deactivated non-admin actors.
create or replace function public.release_seat_range(
  p_seat_id uuid,
  p_start_date date,
  p_end_date date,
  p_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_release_id uuid;
begin
  select id into v_owner from public.users where default_seat_id = p_seat_id;

  if v_owner is null then
    raise exception 'Seat has no default owner to release';
  end if;

  if v_owner <> v_actor and not public.is_admin() then
    raise exception 'Only the seat owner or an admin can release this seat';
  end if;

  if not public.is_admin() and not public.is_active_actor() then
    raise exception 'Your account is deactivated';
  end if;

  if p_end_date < p_start_date then
    raise exception 'end_date must be on or after start_date';
  end if;

  v_release_id := public._upsert_seat_release(v_owner, p_seat_id, p_start_date, p_end_date, p_reason, v_actor);

  perform public.log_activity(v_actor, 'RELEASE', p_seat_id,
    (select location_id from public.seats where id = p_seat_id),
    jsonb_build_object('start_date', p_start_date, 'end_date', p_end_date, 'reason', p_reason, 'owner', v_owner));

  return v_release_id;
end;
$$;

-- _book_seat_range_internal(): auto-release path now also merges via the
-- same helper instead of a raw insert, closing the identical duplicate-row
-- bug on the "book elsewhere -> auto-release my default seat" path.
create or replace function public._book_seat_range_internal(
  p_seat_id uuid,
  p_start_date date,
  p_end_date date,
  p_target uuid,
  p_actor uuid,
  p_bypass_conflict boolean default false
) returns setof public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_location uuid;
  v_default_seat uuid;
  v_d date;
  v_conflict record;
begin
  if p_end_date < p_start_date then
    raise exception 'end_date must be on or after start_date';
  end if;

  select location_id into v_location from public.seats where id = p_seat_id and is_active = true;
  if v_location is null then
    raise exception 'Seat not found or inactive';
  end if;

  select default_seat_id into v_default_seat
  from public.users where id = p_target;

  if not p_bypass_conflict then
    for v_d in select generate_series(p_start_date, p_end_date, interval '1 day')::date loop
      select b.* into v_conflict
      from public.bookings b
      where b.seat_id = p_seat_id and b.booking_date = v_d and b.status = 'CONFIRMED';
      if found and v_conflict.user_id <> p_target then
        raise exception 'Seat % is already booked on %', p_seat_id, v_d;
      end if;
    end loop;
  end if;

  if v_default_seat is not null and v_default_seat <> p_seat_id then
    perform public._upsert_seat_release(
      p_target, v_default_seat, p_start_date, p_end_date, 'Auto-released: booked seat elsewhere', p_actor
    );
  end if;

  return query
  insert into public.bookings (user_id, seat_id, location_id, booking_date, status, created_by)
  select p_target, p_seat_id, v_location, d::date, 'CONFIRMED', p_actor
  from generate_series(p_start_date, p_end_date, interval '1 day') as d
  on conflict (seat_id, booking_date) where (status = 'CONFIRMED')
  do update set user_id = excluded.user_id, created_by = excluded.created_by
  returning *;
end;
$$;

-- book_seat_range() / request_seat(): also block deactivated non-admin actors.
create or replace function public.book_seat_range(
  p_seat_id uuid,
  p_start_date date,
  p_end_date date,
  p_for_user_id uuid default null
) returns setof public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_target uuid := coalesce(p_for_user_id, auth.uid());
begin
  if v_target <> v_actor and not public.is_admin() then
    raise exception 'Only an admin can book on behalf of another user';
  end if;

  if not public.is_admin() and not public.is_active_actor() then
    raise exception 'Your account is deactivated';
  end if;

  return query
  select * from public._book_seat_range_internal(
    p_seat_id, p_start_date, p_end_date, v_target, v_actor, public.is_admin()
  );
end;
$$;

create or replace function public.request_seat(
  p_seat_id uuid,
  p_requested_date date
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_occupant uuid;
  v_request_id uuid;
begin
  if not public.is_admin() and not public.is_active_actor() then
    raise exception 'Your account is deactivated';
  end if;

  select occupant_id into v_occupant
  from public.get_seat_map((select location_id from public.seats where id = p_seat_id), p_requested_date)
  where seat_id = p_seat_id;

  if v_occupant is null then
    raise exception 'Seat is not occupied on this date; book it directly instead';
  end if;

  if v_occupant = v_actor then
    raise exception 'You already occupy this seat on this date';
  end if;

  insert into public.seat_requests (requester_id, target_user_id, seat_id, requested_date, status)
  values (v_actor, v_occupant, p_seat_id, p_requested_date, 'PENDING')
  returning id into v_request_id;

  perform public.log_activity(v_actor, 'REQUEST_SEAT', p_seat_id, null,
    jsonb_build_object('target_user_id', v_occupant, 'requested_date', p_requested_date));

  return v_request_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- One-time cleanup: re-insert every existing release one at a time through
-- the merge-aware helper, for any (seat, user) pair that has more than one
-- row today. Rows that genuinely overlap/touch collapse into one; rows that
-- don't (two separate future release windows) correctly stay separate.
-- ----------------------------------------------------------------------------
do $$
declare
  v_pair record;
  v_row record;
begin
  for v_pair in
    select seat_id, user_id
    from public.seat_releases
    group by seat_id, user_id
    having count(*) > 1
  loop
    for v_row in
      select id, start_date, end_date, reason, created_by
      from public.seat_releases
      where seat_id = v_pair.seat_id and user_id = v_pair.user_id
      order by start_date
    loop
      delete from public.seat_releases where id = v_row.id;
      perform public._upsert_seat_release(
        v_pair.user_id, v_pair.seat_id, v_row.start_date, v_row.end_date, v_row.reason, v_row.created_by
      );
    end loop;
  end loop;
end $$;
