-- ============================================================================
-- 0012_expand_booking_window.sql
--
-- Widens the regular booking window from 3 total working days (today + 2
-- more) to 4 total working days (today + the next 3 working days). The
-- employee-facing copy ("book for the next 3 working days") was correct in
-- spirit but the actual window undercounted by one day relative to it —
-- this makes the window match: today is available immediately, and the
-- following 3 working days are the "next 3" the message refers to.
-- ============================================================================

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
      3
    ) as max_date;
$$;

grant execute on function public.get_booking_window() to authenticated;
