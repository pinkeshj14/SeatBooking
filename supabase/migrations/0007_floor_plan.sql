-- ============================================================================
-- 0007_floor_plan.sql
-- Adds support for a custom, image-backed floor plan per location (as an
-- alternative to the default uniform grid): an uploaded floor plan image
-- plus a percentage-based (x, y) position per seat, so seats can be placed
-- exactly where they sit on a real CAD-exported floor plan.
-- ============================================================================

alter table public.locations
  add column if not exists layout_mode text not null default 'grid' check (layout_mode in ('grid', 'image')),
  add column if not exists floor_plan_path text;

alter table public.seats
  add column if not exists pos_x numeric check (pos_x is null or (pos_x >= 0 and pos_x <= 100)),
  add column if not exists pos_y numeric check (pos_y is null or (pos_y >= 0 and pos_y <= 100));

-- ----------------------------------------------------------------------------
-- Storage bucket for floor plan images. Public read (so <img> tags can load
-- them directly without a signed URL); writes restricted to admins.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('floor-plans', 'floor-plans', true)
on conflict (id) do nothing;

drop policy if exists "floor_plans_public_read" on storage.objects;
create policy "floor_plans_public_read"
  on storage.objects for select
  using (bucket_id = 'floor-plans');

drop policy if exists "floor_plans_admin_insert" on storage.objects;
create policy "floor_plans_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'floor-plans' and public.is_admin());

drop policy if exists "floor_plans_admin_update" on storage.objects;
create policy "floor_plans_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'floor-plans' and public.is_admin())
  with check (bucket_id = 'floor-plans' and public.is_admin());

drop policy if exists "floor_plans_admin_delete" on storage.objects;
create policy "floor_plans_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'floor-plans' and public.is_admin());

-- ----------------------------------------------------------------------------
-- admin_set_location_floor_plan(): point a location at an uploaded image and
-- switch its rendering mode.
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_location_floor_plan(
  p_location_id uuid,
  p_floor_plan_path text,
  p_layout_mode text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can update the floor plan';
  end if;
  if p_layout_mode not in ('grid', 'image') then
    raise exception 'Invalid layout mode: %', p_layout_mode;
  end if;

  update public.locations
  set floor_plan_path = p_floor_plan_path, layout_mode = p_layout_mode
  where id = p_location_id;

  perform public.log_activity(auth.uid(), 'ADMIN_SET_FLOOR_PLAN', null, p_location_id,
    jsonb_build_object('layout_mode', p_layout_mode));
end;
$$;

-- ----------------------------------------------------------------------------
-- admin_bulk_update_seat_positions(): persist dragged seat positions in one
-- round trip. p_positions is a JSON array of {seat_id, pos_x, pos_y}.
-- ----------------------------------------------------------------------------
create or replace function public.admin_bulk_update_seat_positions(p_positions jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can update seat positions';
  end if;

  update public.seats s
  set pos_x = v.pos_x, pos_y = v.pos_y
  from jsonb_to_recordset(p_positions) as v(seat_id uuid, pos_x numeric, pos_y numeric)
  where s.id = v.seat_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- get_seat_map(): re-created to also return pos_x/pos_y so image-mode floor
-- plans can position each seat marker. CREATE OR REPLACE can't change a
-- table-returning function's output columns, so drop first.
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
