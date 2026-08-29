-- ============================================================================
-- 0002_functions.sql
-- Helper functions, triggers, and business-logic RPCs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- is_admin(): security-definer helper used by RLS policies (avoids recursive
-- RLS lookups against public.users).
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'ADMIN'
  );
$$;

-- ----------------------------------------------------------------------------
-- handle_new_user(): creates a public.users row whenever a new auth.users
-- row is inserted (Supabase Auth sign-up / magic link / admin invite).
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'EMPLOYEE')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- guard_users_self_update(): the "users can update their own row" RLS policy
-- only restricts which ROW can be touched, not which COLUMNS change. Without
-- this trigger, an employee could self-escalate by setting their own role to
-- ADMIN or hijacking any seat via a direct table update. Only admins (or the
-- SECURITY DEFINER RPCs, which run as the function owner and therefore skip
-- this trigger's auth.uid() check is irrelevant since they update as the
-- owner role) may change role / default_location_id / default_seat_id.
-- ----------------------------------------------------------------------------
create or replace function public.guard_users_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null for service-role callers (e.g. scripts/seed-users.mjs,
  -- which runs with the service key and no user session) — trusted by
  -- definition since only the service_role key, never exposed to the
  -- browser, reaches Postgres with no JWT at all.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.default_location_id is distinct from old.default_location_id
     or new.default_seat_id is distinct from old.default_seat_id then
    raise exception 'Only an admin can change role or seat assignment';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_users_self_update on public.users;
create trigger guard_users_self_update
  before update on public.users
  for each row execute function public.guard_users_self_update();

-- ----------------------------------------------------------------------------
-- log_activity(): internal helper to append to activity_log.
-- ----------------------------------------------------------------------------
create or replace function public.log_activity(
  p_actor_id uuid,
  p_action text,
  p_seat_id uuid,
  p_location_id uuid,
  p_details jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_log (actor_id, action, seat_id, location_id, details)
  values (p_actor_id, p_action, p_seat_id, p_location_id, p_details);
end;
$$;

-- Internal helper only — never callable directly via the client RPC API,
-- otherwise any authenticated user could forge activity_log entries
-- attributed to someone else.
revoke all on function public.log_activity(uuid, text, uuid, uuid, jsonb) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- get_seat_map(): derives per-seat status for a location on a given date.
-- Status: AVAILABLE | OWN | OCCUPIED | PENDING
-- ----------------------------------------------------------------------------
create or replace function public.get_seat_map(p_location_id uuid, p_date date)
returns table (
  seat_id uuid,
  seat_number text,
  row_idx int,
  col_idx int,
  is_active boolean,
  status text,
  occupant_id uuid,
  occupant_name text,
  is_default_seat boolean,
  default_owner_id uuid,
  default_owner_name text,
  released boolean,
  pending_request_id uuid
)
language sql
security definer
set search_path = public
stable
as $$
  with seat_base as (
    select
      s.id as seat_id,
      s.seat_number,
      s.row_idx,
      s.col_idx,
      s.is_active,
      s.location_id,
      owner.id as default_owner_id,
      owner.full_name as default_owner_name
    from public.seats s
    left join public.users owner on owner.default_seat_id = s.id
    where s.location_id = p_location_id
  ),
  release_check as (
    select seat_base.seat_id, true as is_released
    from seat_base
    join public.seat_releases sr
      on sr.seat_id = seat_base.seat_id
     and p_date between sr.start_date and sr.end_date
  ),
  booking_check as (
    select b.seat_id, b.user_id as occupant_id, u.full_name as occupant_name
    from public.bookings b
    join public.users u on u.id = b.user_id
    where b.location_id = p_location_id
      and b.booking_date = p_date
      and b.status = 'CONFIRMED'
  ),
  pending_check as (
    select sr.seat_id, sr.id as pending_request_id
    from public.seat_requests sr
    where sr.requested_date = p_date
      and sr.status = 'PENDING'
      and sr.seat_id in (select seat_id from seat_base)
  )
  select
    sb.seat_id,
    sb.seat_number,
    sb.row_idx,
    sb.col_idx,
    sb.is_active,
    case
      when bc.occupant_id is not null then 'OCCUPIED'
      when sb.default_owner_id is not null and rc.is_released is null then 'OCCUPIED'
      else 'AVAILABLE'
    end as status,
    coalesce(bc.occupant_id, case when rc.is_released is null then sb.default_owner_id else null end) as occupant_id,
    coalesce(bc.occupant_name, case when rc.is_released is null then sb.default_owner_name else null end) as occupant_name,
    (sb.default_owner_id is not null) as is_default_seat,
    sb.default_owner_id,
    sb.default_owner_name,
    coalesce(rc.is_released, false) as released,
    pc.pending_request_id
  from seat_base sb
  left join release_check rc on rc.seat_id = sb.seat_id
  left join booking_check bc on bc.seat_id = sb.seat_id
  left join pending_check pc on pc.seat_id = sb.seat_id
  order by sb.row_idx, sb.col_idx, sb.seat_number;
$$;

-- ----------------------------------------------------------------------------
-- release_seat_range(): employee (or admin on their behalf) releases a seat
-- for a date range.
-- ----------------------------------------------------------------------------
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

  if p_end_date < p_start_date then
    raise exception 'end_date must be on or after start_date';
  end if;

  insert into public.seat_releases (user_id, seat_id, start_date, end_date, reason, created_by)
  values (v_owner, p_seat_id, p_start_date, p_end_date, p_reason, v_actor)
  returning id into v_release_id;

  perform public.log_activity(v_actor, 'RELEASE', p_seat_id,
    (select location_id from public.seats where id = p_seat_id),
    jsonb_build_object('start_date', p_start_date, 'end_date', p_end_date, 'reason', p_reason, 'owner', v_owner));

  return v_release_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- cancel_release(): remove/undo a previously created release.
-- ----------------------------------------------------------------------------
create or replace function public.cancel_release(p_release_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_release public.seat_releases;
begin
  select * into v_release from public.seat_releases where id = p_release_id;
  if v_release.id is null then
    raise exception 'Release not found';
  end if;
  if v_release.user_id <> v_actor and not public.is_admin() then
    raise exception 'Not authorized to cancel this release';
  end if;
  delete from public.seat_releases where id = p_release_id;
  perform public.log_activity(v_actor, 'CANCEL_RELEASE', v_release.seat_id, null,
    jsonb_build_object('release_id', p_release_id));
end;
$$;

-- ----------------------------------------------------------------------------
-- _book_seat_range_internal(): shared booking logic with NO permission
-- checks — callers (book_seat_range, respond_seat_request) are responsible
-- for authorizing the caller before invoking this. This split exists
-- because respond_seat_request must be able to book the seat for the
-- REQUESTER on behalf of the approving peer (neither of whom is an admin),
-- which book_seat_range's own self-or-admin check would otherwise reject.
-- p_bypass_conflict lets a peer-approved transfer replace the approver's own
-- current hold on the seat without tripping the double-booking guard.
-- ----------------------------------------------------------------------------
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

  -- Guard against double-booking an already-occupied seat on any day in range.
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

  -- Auto-release the user's own default seat if they are booking elsewhere.
  if v_default_seat is not null and v_default_seat <> p_seat_id then
    insert into public.seat_releases (user_id, seat_id, start_date, end_date, reason, created_by)
    values (p_target, v_default_seat, p_start_date, p_end_date, 'Auto-released: booked seat elsewhere', p_actor);
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

-- This function performs NO authorization checks by design (see comment
-- above) — it must never be reachable directly via the client RPC API.
-- Only book_seat_range() and respond_seat_request(), which already do their
-- own auth checks, may call it (a direct SQL function call doesn't need an
-- explicit grant between functions owned by the same role).
revoke all on function public._book_seat_range_internal(uuid, date, date, uuid, uuid, boolean) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- book_seat_range(): public entrypoint. Book a seat for a date range. If the
-- seat differs from the user's default seat, their default seat is
-- automatically released for the same period (covers the inter-location
-- auto-release rule, and generalizes safely to same-location swaps too).
-- ----------------------------------------------------------------------------
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

  return query
  select * from public._book_seat_range_internal(
    p_seat_id, p_start_date, p_end_date, v_target, v_actor, public.is_admin()
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- cancel_booking_range(): cancel a user's bookings for a seat across a range.
-- ----------------------------------------------------------------------------
create or replace function public.cancel_booking_range(
  p_seat_id uuid,
  p_start_date date,
  p_end_date date
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  update public.bookings
  set status = 'CANCELLED'
  where seat_id = p_seat_id
    and booking_date between p_start_date and p_end_date
    and status = 'CONFIRMED'
    and (user_id = v_actor or public.is_admin());

  perform public.log_activity(v_actor, 'CANCEL_BOOKING', p_seat_id, null,
    jsonb_build_object('start_date', p_start_date, 'end_date', p_end_date));
end;
$$;

-- ----------------------------------------------------------------------------
-- request_seat(): employee requests an occupied seat from its current
-- occupant for a specific date.
-- ----------------------------------------------------------------------------
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
-- respond_seat_request(): target user (or admin) approves/rejects a request.
-- On approval: releases the target's hold on the seat for that date and
-- books it for the requester.
-- ----------------------------------------------------------------------------
create or replace function public.respond_seat_request(
  p_request_id uuid,
  p_approve boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_req public.seat_requests;
begin
  select * into v_req from public.seat_requests where id = p_request_id;
  if v_req.id is null then
    raise exception 'Request not found';
  end if;
  if v_req.status <> 'PENDING' then
    raise exception 'Request already resolved';
  end if;
  if v_req.target_user_id <> v_actor and not public.is_admin() then
    raise exception 'Not authorized to respond to this request';
  end if;

  if p_approve then
    -- Bypass the conflict check: the seat is currently held by v_actor (the
    -- approving target user), so booking it for the requester is expected
    -- to replace that hold, not collide with it.
    perform public._book_seat_range_internal(
      v_req.seat_id, v_req.requested_date, v_req.requested_date, v_req.requester_id, v_actor, true
    );

    update public.seat_requests
    set status = 'APPROVED', resolved_at = now()
    where id = p_request_id;

    perform public.log_activity(v_actor, 'TRANSFER_APPROVED', v_req.seat_id, null,
      jsonb_build_object('request_id', p_request_id, 'requester_id', v_req.requester_id, 'date', v_req.requested_date));
  else
    update public.seat_requests
    set status = 'REJECTED', resolved_at = now()
    where id = p_request_id;

    perform public.log_activity(v_actor, 'TRANSFER_REJECTED', v_req.seat_id, null,
      jsonb_build_object('request_id', p_request_id, 'requester_id', v_req.requester_id, 'date', v_req.requested_date));
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- admin_reassign_default_seat(): change a user's permanent/default seat.
-- ----------------------------------------------------------------------------
create or replace function public.admin_reassign_default_seat(
  p_user_id uuid,
  p_seat_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_location uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can reassign default seats';
  end if;

  select location_id into v_location from public.seats where id = p_seat_id;
  if v_location is null then
    raise exception 'Seat not found';
  end if;

  -- Free the seat from any previous holder first (default_seat_id is unique).
  update public.users
  set default_seat_id = null
  where default_seat_id = p_seat_id and id <> p_user_id;

  update public.users
  set default_seat_id = p_seat_id, default_location_id = v_location
  where id = p_user_id;

  perform public.log_activity(v_actor, 'ADMIN_REASSIGN', p_seat_id, v_location,
    jsonb_build_object('user_id', p_user_id));
end;
$$;

-- ----------------------------------------------------------------------------
-- admin_set_seat_active(): lock/unlock a seat (e.g. under repair, decommissioned).
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_seat_active(
  p_seat_id uuid,
  p_is_active boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_location uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can lock/unlock seats';
  end if;

  update public.seats set is_active = p_is_active where id = p_seat_id
  returning location_id into v_location;

  perform public.log_activity(v_actor, case when p_is_active then 'ADMIN_UNLOCK' else 'ADMIN_LOCK' end,
    p_seat_id, v_location, '{}'::jsonb);
end;
$$;

-- ----------------------------------------------------------------------------
-- expire_stale_requests(): mark PENDING requests EXPIRED once their date has
-- passed. Intended to be called from a scheduled job (pg_cron) or on demand.
-- ----------------------------------------------------------------------------
create or replace function public.expire_stale_requests()
returns void
language sql
security definer
set search_path = public
as $$
  update public.seat_requests
  set status = 'EXPIRED', resolved_at = now()
  where status = 'PENDING' and requested_date < current_date;
$$;
