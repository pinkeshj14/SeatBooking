-- ============================================================================
-- 0006_analytics.sql
-- Aggregate functions backing the admin Activity & Analytics dashboard.
-- Both are admin-only: they run SECURITY DEFINER (to read across all users'
-- data) so they explicitly re-check is_admin() themselves rather than
-- relying on the caller only being reached through an admin-guarded route.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- get_occupancy_trend(): occupied vs. total active seats per day, across all
-- locations, for the trailing p_days days (including today).
-- ----------------------------------------------------------------------------
create or replace function public.get_occupancy_trend(p_days int default 14)
returns table (
  day date,
  occupied_count int,
  released_count int,
  total_active_seats int
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  return query
  with days as (
    select generate_series((current_date - (p_days - 1)), current_date, interval '1 day')::date as day
  ),
  active_seats as (
    select id, location_id from public.seats where is_active = true
  ),
  totals as (
    select count(*) as total from active_seats
  ),
  released as (
    select d.day, count(distinct sr.seat_id) as released_count
    from days d
    join public.seat_releases sr
      on d.day between sr.start_date and sr.end_date
    group by d.day
  ),
  booked as (
    select b.booking_date as day, count(distinct b.seat_id) as booked_count
    from public.bookings b
    join days d on d.day = b.booking_date
    where b.status = 'CONFIRMED'
    group by b.booking_date
  ),
  defaults_occupied as (
    -- default owners who are NOT released on that day are counted as occupying
    -- their default seat (mirrors get_seat_map's derivation).
    select d.day, count(*) as default_occupied_count
    from days d
    cross join public.users u
    where u.default_seat_id is not null
      and not exists (
        select 1 from public.seat_releases sr
        where sr.seat_id = u.default_seat_id and d.day between sr.start_date and sr.end_date
      )
    group by d.day
  )
  select
    d.day,
    (coalesce(def.default_occupied_count, 0) + coalesce(bk.booked_count, 0))::int as occupied_count,
    coalesce(r.released_count, 0)::int as released_count,
    (select total from totals)::int as total_active_seats
  from days d
  left join released r on r.day = d.day
  left join booked bk on bk.day = d.day
  left join defaults_occupied def on def.day = d.day
  order by d.day;
end;
$$;

-- ----------------------------------------------------------------------------
-- get_activity_log(): paginated activity feed with actor name resolved.
-- ----------------------------------------------------------------------------
create or replace function public.get_activity_log(p_limit int default 50, p_offset int default 0)
returns table (
  id uuid,
  actor_id uuid,
  actor_name text,
  action text,
  seat_number text,
  location_name text,
  details jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  return query
  select
    al.id,
    al.actor_id,
    u.full_name as actor_name,
    al.action,
    s.seat_number,
    l.name as location_name,
    al.details,
    al.created_at
  from public.activity_log al
  left join public.users u on u.id = al.actor_id
  left join public.seats s on s.id = al.seat_id
  left join public.locations l on l.id = al.location_id
  order by al.created_at desc
  limit p_limit offset p_offset;
end;
$$;

grant execute on function public.get_occupancy_trend(int) to authenticated;
grant execute on function public.get_activity_log(int, int) to authenticated;
