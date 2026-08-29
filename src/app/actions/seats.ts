'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

type ActionResult = { success: true } | { success: false; error: string };

function toResult(error: { message: string } | null): ActionResult {
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function releaseSeatAction(
  seatId: string,
  startDate: string,
  endDate: string,
  reason: string | null
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('release_seat_range', {
    p_seat_id: seatId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_reason: reason,
  });
  revalidatePath('/dashboard');
  revalidatePath('/admin');
  return toResult(error);
}

export async function cancelReleaseAction(releaseId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_release', { p_release_id: releaseId });
  revalidatePath('/dashboard');
  revalidatePath('/admin');
  return toResult(error);
}

export async function bookSeatAction(
  seatId: string,
  startDate: string,
  endDate: string,
  forUserId?: string | null
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('book_seat_range', {
    p_seat_id: seatId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_for_user_id: forUserId ?? null,
  });
  revalidatePath('/dashboard');
  revalidatePath('/admin');
  return toResult(error);
}

export async function cancelBookingAction(
  seatId: string,
  startDate: string,
  endDate: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_booking_range', {
    p_seat_id: seatId,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  revalidatePath('/dashboard');
  revalidatePath('/admin');
  return toResult(error);
}

export async function requestSeatAction(
  seatId: string,
  requestedDate: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('request_seat', {
    p_seat_id: seatId,
    p_requested_date: requestedDate,
  });
  revalidatePath('/dashboard');
  return toResult(error);
}

export async function respondSeatRequestAction(
  requestId: string,
  approve: boolean
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('respond_seat_request', {
    p_request_id: requestId,
    p_approve: approve,
  });
  revalidatePath('/dashboard');
  revalidatePath('/admin');
  return toResult(error);
}

export async function adminSetSeatActiveAction(
  seatId: string,
  isActive: boolean
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_seat_active', {
    p_seat_id: seatId,
    p_is_active: isActive,
  });
  revalidatePath('/admin');
  revalidatePath('/dashboard');
  return toResult(error);
}

export async function adminReassignSeatAction(
  userId: string,
  seatId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_reassign_default_seat', {
    p_user_id: userId,
    p_seat_id: seatId,
  });
  revalidatePath('/admin');
  revalidatePath('/admin/reassign');
  return toResult(error);
}
