'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { LayoutMode } from '@/types/database';

type ActionResult = { success: true } | { success: false; error: string };

function toResult(error: { message: string } | null): ActionResult {
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function setLocationFloorPlanAction(
  locationId: string,
  floorPlanPath: string | null,
  layoutMode: LayoutMode
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_location_floor_plan', {
    p_location_id: locationId,
    p_floor_plan_path: floorPlanPath,
    p_layout_mode: layoutMode,
  });
  revalidatePath('/admin/floor-plan');
  revalidatePath('/admin');
  revalidatePath('/dashboard');
  return toResult(error);
}

export async function bulkUpdateSeatPositionsAction(
  positions: { seat_id: string; pos_x: number; pos_y: number }[]
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_bulk_update_seat_positions', {
    p_positions: positions,
  });
  revalidatePath('/admin/floor-plan');
  revalidatePath('/admin');
  revalidatePath('/dashboard');
  return toResult(error);
}
