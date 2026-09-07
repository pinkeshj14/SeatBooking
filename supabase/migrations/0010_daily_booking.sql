-- ============================================================================
-- 0010_daily_booking.sql
--
-- Converts default-seat occupancy from "permanently assigned" to a daily
-- booking model, while keeping the seat ownership concept:
--
--   1. A user's default seat is exclusively reserved for them until 9:00 PM
--      the day before, but that reservation is VIRTUAL — no booking row is
--      created automatically. get_seat_map() now derives three distinct
--      occupancy states instead of two: real booking > virtual reservation
--      (pre-cutoff, unbooked) > available.
--   2. Booking (including an owner explicitly confirming their own seat) now
--      always requires an actual `bookings` row — book_seat_range() no
--      longer treats "it's your default seat" as automatically occupying it.
--   3. Regular (non-admin) bookings are restricted to the next 3 working
--      days counting from today (today counts as day 1 if it's a working
--      day, else the window starts the next working day), Monday-Friday
--      only. Admin overrides remain completely unrestricted, matching
--      existing admin behavior elsewhere in the app.
--   4. Releasing a seat now also cancels any real booking the owner already
--      made for the released dates, so "release" reliably frees the seat
--      either way (virtual reservation or a confirmed booking).
--
-- Everything else (release semantics/merge behavior from 0008, peer
-- transfer, admin overrides, RLS, floor plan, master data) is unchanged.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- is_working_day() / add_working_days(): Monday-Friday helpers.
-- ----------------------------------------------------------------------------
create or replace function public.is_working_day(p_date date)
returns boolean
language sql
immutable
as $$
  select extract(isodow from p_date) between 1 and 5;
$$;

create or replace function public.add_working_days(p_start date, p_n int)
returns date
language plpgsql
immutable
as $$
declare
  v_date date := p_start;
  v_count int := 0;
begin
  while v_count < p_n loop
    v_date := v_date + 1;
    if public.is_working_day(v_date) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_date;
end;
$$;

-- ----------------------------------------------------------------------------
-- get_booking_window(): the currently-valid range for a regular booking —
-- today (if it's a working day) or the next working day, plus 2 more
-- working days (3 working days total). Admins are not bound by this; it
-- exists so both the RPC guard and the client UI use one source of truth.
-- ----------------------------------------------------------------------------
create or replace function public.get_booking_window()
returns table (min_date date, max_date date)
language sql
stable
as $$
  select
    case when public.is_working_day(current_date) then current_date
         else public.add_working_days(current_date, 1) end as min_date,
    public.add_working_days(
      case when public.is_working_day(current_date) then current_date
           else public.add_working_days(current_date, 1) end,
      2
    ) as max_date;
$$;

grant execute on function public.get_booking_window() to authenticated;

-- ----------------------------------------------------------------------------
-- reservation_cutoff(): 9:00 PM on the day before p_date, in the office's
-- local timezone. Defaulted to Asia/Kolkata based on this deployment's seed
-- data (Indian sample names/company) — change the literal below if your
-- office is elsewhere; it's the one place this is defined.
-- ----------------------------------------------------------------------------
create or replace function public.reservation_cutoff(p_date date)
returns timestamptz
language sql
immutable
as $$
  select ((p_date - 1)::timestamp + interval '21 hours') at time zone 'Asia/Kolkata';
$$;

-- ----------------------------------------------------------------------------
-- get_seat_map(): re-derived occupancy — a real booking always wins; absent
-- that, an unreleased default seat shows as reserved-for-owner only until
-- its cutoff; after the cutoff (or once released) it's available to anyone.
-- Adds is_reserved_pending so the UI can tell "reserved, not yet booked"
-- apart from "actually booked", which matters for the owner's own seat (see
-- book_seat_range below — booking your own seat now requires the same
-- explicit action as booking any other seat).
-- ----------------------------------------------------------------------------
drop function if exists public.get_seat_map(uuid, date);

create or replace function public.get_seat_map(p_location_id uuid, p_date date)
returns table (
  seat_id uuid,
  seat_number text,
  row_idx int,
  col_idx int,
  pos_x numeric,
  pos_y numeric,
  is_active boolean,
  status text,
  occupant_id uuid,
  occupant_name text,
  is_default_seat boolean,
  default_owner_id uuid,
  default_owner_name text,
  released boolean,
  is_reserved_pending boolean,
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
      s.pos_x,
      s.pos_y,
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
  ),
  reservation_check as (
    select
      sb.seat_id,
      (
        sb.default_owner_id is not null
        and rc.is_released is null
        and now() < public.reservation_cutoff(p_date)
      ) as is_reserved
    from seat_base sb
    left join release_check rc on rc.seat_id = sb.seat_id
  )
  select
    sb.seat_id,
    sb.seat_number,
    sb.row_idx,
    sb.col_idx,
    sb.pos_x,
    sb.pos_y,
    sb.is_active,
    case
      when bc.occupant_id is not null then 'OCCUPIED'
      when rvc.is_reserved then 'OCCUPIED'
      else 'AVAILABLE'
    end as status,
    coalesce(bc.occupant_id, case when rvc.is_reserved then sb.default_owner_id else null end) as occupant_id,
    coalesce(bc.occupant_name, case when rvc.is_reserved then sb.default_owner_name else null end) as occupant_name,
    (sb.default_owner_id is not null) as is_default_seat,
    sb.default_owner_id,
    sb.default_owner_name,
    coalesce(rc.is_released, false) as released,
    (bc.occupant_id is null and rvc.is_reserved) as is_reserved_pending,
    pc.pending_request_id
  from seat_base sb
  left join release_check rc on rc.seat_id = sb.seat_id
  left join booking_check bc on bc.seat_id = sb.seat_id
  left join pending_check pc on pc.seat_id = sb.seat_id
  left join reservation_check rvc on rvc.seat_id = sb.seat_id
  order by sb.row_idx, sb.col_idx, sb.seat_number;
$$;

-- ----------------------------------------------------------------------------
-- book_seat_range(): unchanged permission model, but now also enforces the
-- 3-working-day booking window and working-days-only rule for non-admins.
-- The "own default seat" special case is gone — booking now always creates
-- a real row, for anyone, including the owner booking their own seat.
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
  v_window record;
  v_seat_owner uuid;
  v_d date;
begin
  if v_target <> v_actor and not public.is_admin() then
    raise exception 'Only an admin can book on behalf of another user';
  end if;

  if not public.is_admin() and not public.is_active_actor() then
    raise exception 'Your account is deactivated';
  end if;

  if not public.is_admin() then
    select * into v_window from public.get_booking_window();

    if p_start_date < v_window.min_date or p_end_date > v_window.max_date then
      raise exception 'Bookings can only be made for the next 3 working days (% to %)',
        v_window.min_date, v_window.max_date;
    end if;

    for v_d in select generate_series(p_start_date, p_end_date, interval '1 day')::date loop
      if not public.is_working_day(v_d) then
        raise exception 'Cannot book % — weekends are not bookable', v_d;
      end if;
    end loop;

    -- Enforce the assigned owner's exclusive reservation window server-side
    -- too, not just via the floor map's displayed status — otherwise this
    -- RPC could be called directly to book someone else's still-reserved
    -- seat before their 9 PM cutoff, bypassing "Request seat".
    select id into v_seat_owner from public.users where default_seat_id = p_seat_id;
    if v_seat_owner is not null and v_seat_owner <> v_target then
      for v_d in select generate_series(p_start_date, p_end_date, interval '1 day')::date loop
        if now() < public.reservation_cutoff(v_d)
           and not exists (
             select 1 from public.seat_releases sr
             where sr.seat_id = p_seat_id and v_d between sr.start_date and sr.end_date
           )
        then
          raise exception
            'Seat % is reserved for its assigned owner until 9 PM the day before % — use "Request seat" instead',
            p_seat_id, v_d;
        end if;
      end loop;
    end if;
  end if;

  return query
  select * from public._book_seat_range_internal(
    p_seat_id, p_start_date, p_end_date, v_target, v_actor, public.is_admin()
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- release_seat_range(): also cancels any real booking the owner already has
-- for the released dates, so release reliably frees the seat now that
-- booking your own default seat can produce a real booking row.
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

  if not public.is_admin() and not public.is_active_actor() then
    raise exception 'Your account is deactivated';
  end if;

  if p_end_date < p_start_date then
    raise exception 'end_date must be on or after start_date';
  end if;

  update public.bookings
  set status = 'CANCELLED'
  where seat_id = p_seat_id
    and user_id = v_owner
    and booking_date between p_start_date and p_end_date
    and status = 'CONFIRMED';

  v_release_id := public._upsert_seat_release(v_owner, p_seat_id, p_start_date, p_end_date, p_reason, v_actor);

  perform public.log_activity(v_actor, 'RELEASE', p_seat_id,
    (select location_id from public.seats where id = p_seat_id),
    jsonb_build_object('start_date', p_start_date, 'end_date', p_end_date, 'reason', p_reason, 'owner', v_owner));

  return v_release_id;
end;
$$;
