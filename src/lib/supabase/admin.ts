import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Service-role client for Supabase Auth Admin API calls (creating users,
 * changing login emails, banning/unbanning accounts). The `server-only`
 * import makes any accidental client-component import a build error —
 * this key must never reach the browser bundle.
 *
 * Only call this from within `'use server'` action files, and only for the
 * specific admin-auth operations that have no RLS-reachable equivalent.
 * Everything else (seats, most of users) still goes through the normal
 * RLS-scoped server client.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. It is required to create/deactivate users from the Admin Panel — see README.md.'
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
