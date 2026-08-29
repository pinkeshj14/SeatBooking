'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

type ActionResult = { success: true; seatId?: string } | { success: false; error: string };

export interface SeatInput {
  id: string | null;
  locationId: string;
  seatNumber: string;
  rowIdx: number | null;
  colIdx: number | null;
  isActive: boolean;
}

function revalidateSeatPaths() {
  revalidatePath('/admin/master-data');
  revalidatePath('/admin/reassign');
  revalidatePath('/admin/floor-plan');
  revalidatePath('/admin');
  revalidatePath('/dashboard');
}

export async function adminUpsertSeatAction(input: SeatInput): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('admin_upsert_seat', {
    p_id: input.id,
    p_location_id: input.locationId,
    p_seat_number: input.seatNumber,
    p_row_idx: input.rowIdx,
    p_col_idx: input.colIdx,
    p_is_active: input.isActive,
  });

  if (error) return { success: false, error: error.message };
  revalidateSeatPaths();
  return { success: true, seatId: data ?? undefined };
}

export interface BulkSeatRow extends SeatInput {
  rowNumber: number;
}

export interface BulkRowResult {
  rowNumber: number;
  seatNumber: string;
  success: boolean;
  error?: string;
  action: 'created' | 'updated';
}

export async function bulkUpsertSeatsAction(rows: BulkSeatRow[]): Promise<BulkRowResult[]> {
  await requireAdmin();

  const results: BulkRowResult[] = [];
  for (const row of rows) {
    const res = await adminUpsertSeatAction(row);
    results.push({
      rowNumber: row.rowNumber,
      seatNumber: row.seatNumber,
      success: res.success,
      error: res.success ? undefined : res.error,
      action: row.id ? 'updated' : 'created',
    });
  }

  revalidateSeatPaths();
  return results;
}
