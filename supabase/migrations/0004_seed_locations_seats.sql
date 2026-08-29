-- ============================================================================
-- 0004_seed_locations_seats.sql
-- Seeds the 2 locations and 50 seats each (100 seats total, 5 rows x 10 cols).
-- Safe to re-run: uses ON CONFLICT to stay idempotent.
-- Sample users (90 employees + admins) are seeded separately via
-- `npm run seed:users`, since auth.users must be created through the
-- Supabase Auth Admin API rather than plain SQL. See README.md.
-- ============================================================================

insert into public.locations (name, code, total_seats, layout_config)
values
  ('Headquarters - Location A', 'A', 50, '{"rows": 5, "cols": 10}'::jsonb),
  ('Branch - Location B', 'B', 50, '{"rows": 5, "cols": 10}'::jsonb)
on conflict (code) do nothing;

do $$
declare
  v_loc record;
  v_row int;
  v_col int;
  v_seat_num int;
begin
  for v_loc in select id, code, layout_config from public.locations loop
    v_seat_num := 1;
    for v_row in 0 .. (coalesce((v_loc.layout_config->>'rows')::int, 5) - 1) loop
      for v_col in 0 .. (coalesce((v_loc.layout_config->>'cols')::int, 10) - 1) loop
        insert into public.seats (location_id, seat_number, row_idx, col_idx, is_active)
        values (v_loc.id, v_loc.code || '-' || lpad(v_seat_num::text, 2, '0'), v_row, v_col, true)
        on conflict (location_id, seat_number) do nothing;
        v_seat_num := v_seat_num + 1;
      end loop;
    end loop;
  end loop;
end $$;
