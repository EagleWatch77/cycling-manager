import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * The single source of truth for "is this user an admin" — a row in
 * public.admin_users (see supabase/schema.sql), never a hardcoded email
 * comparison or any client-side flag. Uses the normal authenticated
 * (anon-key + session cookie) client, exactly like every other query in this
 * app — no service-role key involved. The `admin_users_select_own` RLS
 * policy is what actually authorizes this read; if a user isn't an admin,
 * the query legitimately returns zero rows rather than being blocked by
 * app-level logic alone.
 *
 * This check is deliberately re-run on every admin page load (no session
 * flag is cached anywhere) so revoking admin access (deleting the
 * admin_users row) takes effect immediately, not after a re-login.
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return data !== null;
}

/**
 * Guard for the top of every admin server component/action. Unauthenticated
 * visitors go to /login; authenticated non-admins go to /dashboard — neither
 * ever reaches the caller, so no admin-only data is fetched, let alone
 * rendered, for a non-admin. This is the app-level half of the protection;
 * the riders_select_admin RLS policy is the DB-level half — both must hold
 * independently (defense in depth), so a bug in one does not expose raw
 * rider data on its own.
 */
export async function requireAdmin(): Promise<{ id: string; email: string | undefined }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) redirect('/dashboard');

  return { id: user.id, email: user.email };
}
