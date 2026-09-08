-- ============================================================================
-- 0011_one_seat_per_date.sql
--
-- Fixes a real correctness gap: book_seat_range()/_book_seat_range_internal()
-- only checked whether the TARGET seat already had someone else's booking —
-- it never checked whether the booking user already held a DIFFERENT seat
-- for the same date(s). That let a user end up with two (or more) seats
-- booked on the same day, and let their own default seat sit in "reserved,
-- not booked" limbo forever even after booking elsewhere with a seat that
-- isn't their default.
--
-- Fix: whenever _book_seat_range_internal() books seat X for a user on a
-- date, it now also:
--   1. Cancels any other CONFIRMED booking that same user holds on any OTHER
--      seat for those same dates (covers "I already explicitly booked seat
--      B, now I'm booking seat C instead").
--   2. Releases the user's own default seat for those dates if it isn't the
--      seat being booked (existing behavior, now runs regardless of whether
--      the default seat had a real booking (case 1) or was only virtually
--      reserved pre-cutoff (nothing to cancel, needs an explicit release so
--      it doesn't keep showing "reserved for owner")).
--
-- This applies universally — self-service booking, peer-transfer approval,
-- and admin overrides — since "one seat per person per date" is a data
-- integrity rule, not just a self-service restriction.
--
-- Also adds get_user_seat_conflicts(), a read-only RPC the client calls
-- BEFORE booking to show a confirmation prompt ("this will release your
-- other seat — continue?") rather than silently auto-releasing.
-- ============================================================================

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

  -- One seat per person per date: cancel any other CONFIRMED booking this
  -- user holds on a different seat for these exact dates.
  update public.bookings
  set status = 'CANCELLED'
  where user_id = p_target
    and seat_id <> p_seat_id
    and booking_date between p_start_date and p_end_date
    and status = 'CONFIRMED';

  -- Auto-release the user's own default seat if they're booking elsewhere —
  -- runs unconditionally (not just when it had a real booking) so a
  -- still-virtual pre-cutoff reservation is also given up, not left dangling.
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

-- ----------------------------------------------------------------------------
-- get_user_seat_conflicts(): for the calling user, lists every OTHER seat
-- they currently hold (a real booking, or their own default seat still in
-- its pre-cutoff reservation window) across the given date range, excluding
-- the seat they're about to book. The client calls this before booking to
-- show "this will release seat X — continue?" instead of silently doing it.
-- ----------------------------------------------------------------------------
create or replace function public.get_user_seat_conflicts(
  p_start_date date,
  p_end_date date,
  p_exclude_seat_id uuid
) returns table (
  seat_id uuid,
  seat_number text,
  conflict_date date,
  hold_type text
)
language sql
security definer
set search_path = public
stable
as $$
  with days as (
    select generate_series(p_start_date, p_end_date, interval '1 day')::date as d
  ),
  booked as (
    select b.seat_id, s.seat_number, b.booking_date as d, 'booked'::text as hold_type
    from public.bookings b
    join public.seats s on s.id = b.seat_id
    where b.user_id = auth.uid()
      and b.seat_id <> p_exclude_seat_id
      and b.status = 'CONFIRMED'
      and b.booking_date between p_start_date and p_end_date
  ),
  reserved as (
    select u.default_seat_id as seat_id, s.seat_number, d.d, 'reserved'::text as hold_type
    from days d
    cross join public.users u
    join public.seats s on s.id = u.default_seat_id
    where u.id = auth.uid()
      and u.default_seat_id is not null
      and u.default_seat_id <> p_exclude_seat_id
      and now() < public.reservation_cutoff(d.d)
      and not exists (
        select 1 from public.seat_releases sr
        where sr.seat_id = u.default_seat_id and d.d between sr.start_date and sr.end_date
      )
      and not exists (
        select 1 from public.bookings b2
        where b2.seat_id = u.default_seat_id and b2.booking_date = d.d and b2.status = 'CONFIRMED'
      )
  )
  select seat_id, seat_number, d as conflict_date, hold_type from booked
  union all
  select seat_id, seat_number, d, hold_type from reserved
  order by conflict_date;
$$;

grant execute on function public.get_user_seat_conflicts(date, date, uuid) to authenticated;
