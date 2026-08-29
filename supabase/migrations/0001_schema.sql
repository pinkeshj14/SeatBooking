-- ============================================================================
-- 0001_schema.sql
-- Core schema for the Office Seat Booking & Management app.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- locations
-- ----------------------------------------------------------------------------
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,               -- 'A' | 'B'
  total_seats int not null default 50,
  layout_config jsonb not null default '{"rows": 5, "cols": 10}'::jsonb,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- seats
-- ----------------------------------------------------------------------------
create table if not exists public.seats (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  seat_number text not null,               -- e.g. 'A-01'
  row_idx int not null default 0,
  col_idx int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (location_id, seat_number)
);

create index if not exists seats_location_id_idx on public.seats (location_id);

-- ----------------------------------------------------------------------------
-- users  (1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role text not null default 'EMPLOYEE' check (role in ('ADMIN', 'EMPLOYEE')),
  default_location_id uuid references public.locations(id) on delete set null,
  default_seat_id uuid references public.seats(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (default_seat_id)
);

create index if not exists users_default_location_idx on public.users (default_location_id);
create index if not exists users_role_idx on public.users (role);

-- ----------------------------------------------------------------------------
-- seat_releases  (dates a user's default seat is marked FREE)
-- ----------------------------------------------------------------------------
create table if not exists public.seat_releases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  seat_id uuid not null references public.seats(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists seat_releases_seat_idx on public.seat_releases (seat_id, start_date, end_date);
create index if not exists seat_releases_user_idx on public.seat_releases (user_id);

-- ----------------------------------------------------------------------------
-- bookings  (one row per seat per day)
-- ----------------------------------------------------------------------------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  seat_id uuid not null references public.seats(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  booking_date date not null,
  status text not null default 'CONFIRMED' check (status in ('CONFIRMED', 'CANCELLED')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- A seat can only have one CONFIRMED booking per day.
create unique index if not exists bookings_seat_date_active_idx
  on public.bookings (seat_id, booking_date)
  where (status = 'CONFIRMED');

create index if not exists bookings_user_date_idx on public.bookings (user_id, booking_date);
create index if not exists bookings_location_date_idx on public.bookings (location_id, booking_date);

-- ----------------------------------------------------------------------------
-- seat_requests  (peer transfer / approval workflow)
-- ----------------------------------------------------------------------------
create table if not exists public.seat_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.users(id) on delete cascade,
  target_user_id uuid not null references public.users(id) on delete cascade,
  seat_id uuid not null references public.seats(id) on delete cascade,
  requested_date date not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists seat_requests_target_idx on public.seat_requests (target_user_id, status);
create index if not exists seat_requests_requester_idx on public.seat_requests (requester_id, status);
create index if not exists seat_requests_seat_date_idx on public.seat_requests (seat_id, requested_date);

-- ----------------------------------------------------------------------------
-- activity_log  (admin analytics / audit trail)
-- ----------------------------------------------------------------------------
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id) on delete set null,
  action text not null,                    -- e.g. 'BOOK', 'RELEASE', 'TRANSFER', 'ADMIN_REASSIGN', 'ADMIN_OVERRIDE'
  seat_id uuid references public.seats(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_created_at_idx on public.activity_log (created_at desc);
create index if not exists activity_log_location_idx on public.activity_log (location_id);
