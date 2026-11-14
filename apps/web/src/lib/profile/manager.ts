import 'server-only';
import { createClient } from '@/lib/supabase/server';

/**
 * The signed-in manager's display name (profiles.display_name), or null when
 * none is stored. Read-only; used by the top bar's profile menu. The name is
 * never invented: with no name the menu simply omits that line.
 */
export async function getMyManagerName(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
  const name = (data?.display_name as string | null | undefined)?.trim();
  return name ? name : null;
}
