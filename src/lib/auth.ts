import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Database } from '@/types/database';

export type Profile = Database['public']['Tables']['users']['Row'];

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  return profile;
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== 'ADMIN') redirect('/dashboard');
  return profile;
}
