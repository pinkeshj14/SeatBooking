-- ============================================================================
-- 0005_realtime.sql
-- Adds the tables the UI needs live updates for to the Supabase Realtime
-- publication (seat map + notification banner).
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table public.bookings;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'seat_releases'
  ) then
    alter publication supabase_realtime add table public.seat_releases;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'seat_requests'
  ) then
    alter publication supabase_realtime add table public.seat_requests;
  end if;
end $$;
