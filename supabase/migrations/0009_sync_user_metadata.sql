-- ============================================================================
-- 0009_sync_user_metadata.sql
--
-- Keeps auth.users (what shows up under Authentication -> Users in the
-- Supabase Dashboard) in sync with public.users for full_name / role,
-- regardless of whether the change came from the Admin Panel or a direct
-- edit to public.users (e.g. the Supabase Table Editor / a raw SQL update).
--
-- Email is intentionally NOT synced this direction. auth.users.email is the
-- actual login credential — GoTrue enforces uniqueness, confirmation state,
-- and identity linking around it that a raw SQL write would bypass. The
-- Admin Panel already changes it correctly (via the Auth Admin API, see
-- adminUpdateUserAction), which is why email changes made THERE already show
-- up in Authentication -> Users. Editing public.users.email directly in
-- Supabase does not change the login email — see README.md § 9.3.
-- ============================================================================

create or replace function public.sync_user_metadata_to_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('full_name', new.full_name, 'role', new.role)
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_public_user_updated on public.users;
create trigger on_public_user_updated
  after update of full_name, role on public.users
  for each row
  when (old.full_name is distinct from new.full_name or old.role is distinct from new.role)
  execute function public.sync_user_metadata_to_auth();

-- Backfill: bring existing auth.users metadata in line with public.users
-- right now, so accounts created/edited before this migration aren't stale.
update auth.users au
set raw_user_meta_data = coalesce(au.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('full_name', pu.full_name, 'role', pu.role)
from public.users pu
where pu.id = au.id
  and (
    au.raw_user_meta_data->>'full_name' is distinct from pu.full_name
    or au.raw_user_meta_data->>'role' is distinct from pu.role
  );
