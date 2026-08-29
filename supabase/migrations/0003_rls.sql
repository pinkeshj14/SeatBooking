-- ============================================================================
-- 0003_rls.sql
-- Row Level Security policies. All mutating business logic goes through the
-- SECURITY DEFINER RPCs in 0002_functions.sql; direct table writes are
-- locked down to the owner/admin so the RPCs remain the supported path.
-- ============================================================================

alter table public.users enable row level security;
alter table public.locations enable row level security;
alter table public.seats enable row level security;
alter table public.seat_releases enable row level security;
alter table public.bookings enable row level security;
alter table public.seat_requests enable row level security;
alter table public.activity_log enable row level security;

-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
create policy "users_select_authenticated"
  on public.users for select
  to authenticated
  using (true);

create policy "users_update_self_limited"
  on public.users for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "users_update_admin"
  on public.users for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "users_insert_admin"
  on public.users for insert
  to authenticated
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- locations
-- ----------------------------------------------------------------------------
create policy "locations_select_authenticated"
  on public.locations for select
  to authenticated
  using (true);

create policy "locations_write_admin"
  on public.locations for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- seats
-- ----------------------------------------------------------------------------
create policy "seats_select_authenticated"
  on public.seats for select
  to authenticated
  using (true);

create policy "seats_write_admin"
  on public.seats for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- seat_releases (writes normally happen via release_seat_range / cancel_release)
-- ----------------------------------------------------------------------------
create policy "seat_releases_select_authenticated"
  on public.seat_releases for select
  to authenticated
  using (true);

create policy "seat_releases_write_owner_or_admin"
  on public.seat_releases for all
  to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ----------------------------------------------------------------------------
-- bookings (writes normally happen via book_seat_range / cancel_booking_range)
-- ----------------------------------------------------------------------------
create policy "bookings_select_authenticated"
  on public.bookings for select
  to authenticated
  using (true);

create policy "bookings_write_owner_or_admin"
  on public.bookings for all
  to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ----------------------------------------------------------------------------
-- seat_requests (writes normally happen via request_seat / respond_seat_request)
-- ----------------------------------------------------------------------------
create policy "seat_requests_select_involved"
  on public.seat_requests for select
  to authenticated
  using (requester_id = auth.uid() or target_user_id = auth.uid() or public.is_admin());

create policy "seat_requests_insert_requester"
  on public.seat_requests for insert
  to authenticated
  with check (requester_id = auth.uid() or public.is_admin());

create policy "seat_requests_update_target_or_admin"
  on public.seat_requests for update
  to authenticated
  using (target_user_id = auth.uid() or public.is_admin())
  with check (target_user_id = auth.uid() or public.is_admin());

-- ----------------------------------------------------------------------------
-- activity_log
-- ----------------------------------------------------------------------------
create policy "activity_log_select_admin"
  on public.activity_log for select
  to authenticated
  using (public.is_admin() or actor_id = auth.uid());

create policy "activity_log_insert_authenticated"
  on public.activity_log for insert
  to authenticated
  with check (actor_id = auth.uid() or public.is_admin());
