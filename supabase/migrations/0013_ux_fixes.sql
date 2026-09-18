-- ============================================================================
-- 0013_ux_fixes.sql
--
-- get_my_confirmed_dates(): lets the client find which upcoming dates the
-- calling user already has a real (CONFIRMED) booking for on a given seat,
-- so the "book additional days" date picker can disable those dates
-- outright — e.g. after an admin force-books a seat for someone for a
-- month, that person can't accidentally "rebook" a day that's already
-- theirs (harmless as a no-op server-side, but confusing/redundant in the
-- UI, so it's prevented at the picker level instead).
-- ============================================================================

create or replace function public.get_my_confirmed_dates(p_seat_id uuid)
returns date[]
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(array_agg(booking_date order by booking_date), '{}'::date[])
  from public.bookings
  where user_id = auth.uid()
    and seat_id = p_seat_id
    and status = 'CONFIRMED'
    and booking_date >= current_date;
$$;

grant execute on function public.get_my_confirmed_dates(uuid) to authenticated;
