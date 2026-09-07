import 'server-only';
import { createClient } from '@/lib/supabase/server';

/**
 * The single source of truth for Premium account entitlement — a row in
 * public.premium_entitlements (see supabase/schema.sql), re-derived on
 * every call, never cached in a session/cookie flag. Mirrors
 * lib/admin/auth.ts's isAdmin() exactly, including why: a player's own
 * Supabase client has no write access to this table at all (no
 * insert/update/delete RLS policy for `authenticated`), so this can only
 * ever be true because an admin (or, later, a real purchase flow) granted
 * it server-side — never because the client set a flag.
 */
export async function isPremiumEntitled(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('premium_entitlements')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return data !== null;
}
