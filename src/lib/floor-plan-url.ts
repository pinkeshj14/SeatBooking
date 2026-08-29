import type { SupabaseClient } from '@supabase/supabase-js';

export const FLOOR_PLANS_BUCKET = 'floor-plans';

/** Synchronous — getPublicUrl just builds the URL, no network call. */
export function getFloorPlanUrl(supabase: SupabaseClient, path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from(FLOOR_PLANS_BUCKET).getPublicUrl(path).data.publicUrl;
}
