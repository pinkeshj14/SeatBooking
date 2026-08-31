'use server';

import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import type { UserRole } from '@/types/database';

type ActionResult = { success: true; userId?: string } | { success: false; error: string };

function randomPassword() {
  return `${randomUUID()}Aa1!`;
}

export interface UserInput {
  email: string;
  fullName: string;
  role: UserRole;
  defaultLocationId: string | null;
  defaultSeatId: string | null;
  isActive: boolean;
}

function revalidateUserPaths() {
  revalidatePath('/admin/master-data');
  revalidatePath('/admin/reassign');
  revalidatePath('/admin');
}

/** Creates a brand-new Supabase Auth user + public.users row (via the existing signup trigger). */
export async function adminCreateUserAction(rawInput: UserInput): Promise<ActionResult> {
  await requireAdmin();

  const input: UserInput = { ...rawInput, email: rawInput.email.trim().toLowerCase() };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: randomPassword(),
    email_confirm: true,
    user_metadata: { full_name: input.fullName, role: input.role },
  });

  if (error) return { success: false, error: error.message };
  const userId = data.user.id;

  // The new user can always sign in via Magic Link regardless of the random
  // password above, so nothing further to hand them.
  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from('users')
    .update({
      full_name: input.fullName,
      role: input.role,
      is_active: input.isActive,
    })
    .eq('id', userId);

  if (updateError) return { success: false, error: updateError.message };

  if (input.defaultSeatId) {
    const { error: seatError } = await supabase.rpc('admin_reassign_default_seat', {
      p_user_id: userId,
      p_seat_id: input.defaultSeatId,
    });
    if (seatError) return { success: false, error: seatError.message };
  } else if (input.defaultLocationId) {
    const { error: locError } = await supabase
      .from('users')
      .update({ default_location_id: input.defaultLocationId })
      .eq('id', userId);
    if (locError) return { success: false, error: locError.message };
  }

  if (!input.isActive) {
    await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
  }

  revalidateUserPaths();
  return { success: true, userId };
}

/** Updates an existing user: email (via Auth Admin API, synced to public.users by trigger), name, role, seat, active status. */
export async function adminUpdateUserAction(userId: string, rawInput: UserInput): Promise<ActionResult> {
  await requireAdmin();

  const input: UserInput = { ...rawInput, email: rawInput.email.trim().toLowerCase() };

  const admin = createAdminClient();
  const supabase = await createClient();

  const { data: current } = await supabase.from('users').select('email').eq('id', userId).single();

  if (current && current.email.toLowerCase() !== input.email) {
    const { error: emailError } = await admin.auth.admin.updateUserById(userId, {
      email: input.email,
      email_confirm: true,
    });
    if (emailError) return { success: false, error: emailError.message };
  }

  // full_name/role changes here also propagate into auth.users' metadata via
  // the on_public_user_updated trigger (0009_sync_user_metadata.sql) — no
  // separate Admin API call needed, and the same trigger covers a direct
  // edit to public.users made outside this action too.
  const { error: updateError } = await supabase
    .from('users')
    .update({ full_name: input.fullName, role: input.role, is_active: input.isActive })
    .eq('id', userId);
  if (updateError) return { success: false, error: updateError.message };

  if (input.defaultSeatId) {
    const { error: seatError } = await supabase.rpc('admin_reassign_default_seat', {
      p_user_id: userId,
      p_seat_id: input.defaultSeatId,
    });
    if (seatError) return { success: false, error: seatError.message };
  } else {
    const { error: locError } = await supabase
      .from('users')
      .update({ default_seat_id: null, default_location_id: input.defaultLocationId })
      .eq('id', userId);
    if (locError) return { success: false, error: locError.message };
  }

  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: input.isActive ? 'none' : '876000h',
  });
  if (banError) return { success: false, error: banError.message };

  revalidateUserPaths();
  return { success: true, userId };
}

export async function adminSetUserActiveAction(userId: string, isActive: boolean): Promise<ActionResult> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_user_active', {
    p_user_id: userId,
    p_is_active: isActive,
  });
  if (error) return { success: false, error: error.message };

  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: isActive ? 'none' : '876000h',
  });
  if (banError) return { success: false, error: banError.message };

  revalidateUserPaths();
  return { success: true };
}

export interface BulkUserRow extends UserInput {
  rowNumber: number;
  userId: string | null;
}

export interface BulkRowResult {
  rowNumber: number;
  email: string;
  success: boolean;
  error?: string;
  action: 'created' | 'updated';
}

export async function bulkUpsertUsersAction(rows: BulkUserRow[]): Promise<BulkRowResult[]> {
  await requireAdmin();

  const results: BulkRowResult[] = [];
  for (const row of rows) {
    if (row.userId) {
      const res = await adminUpdateUserAction(row.userId, row);
      results.push({
        rowNumber: row.rowNumber,
        email: row.email,
        success: res.success,
        error: res.success ? undefined : res.error,
        action: 'updated',
      });
    } else {
      const res = await adminCreateUserAction(row);
      results.push({
        rowNumber: row.rowNumber,
        email: row.email,
        success: res.success,
        error: res.success ? undefined : res.error,
        action: 'created',
      });
    }
  }

  revalidateUserPaths();
  return results;
}
