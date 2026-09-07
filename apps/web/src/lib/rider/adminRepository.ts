import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { SkillAttribute } from './config';

/**
 * Admin-only raw rider access — separate from repository.ts's
 * getMyRider()/listAllRiders() on purpose (see the chat report): those serve
 * the player-facing app and only ever return the caller's own rider plus AI
 * fillers, per the ordinary `riders_select_own` RLS policy. Everything here
 * is for the /admin/riders inspector and depends entirely on the
 * `riders_select_admin` RLS policy (supabase/schema.sql) to see rows beyond
 * that — it uses the exact same authenticated (anon-key) client as the rest
 * of the app, no service-role key. A caller who isn't in admin_users simply
 * gets back whatever riders_select_own already allows them (their own rider
 * + AI rows), never an error and never another player's row — RLS silently
 * narrows the result set rather than this code needing to re-check anything.
 * Page-level admin gating still happens separately via lib/admin/auth.ts;
 * this module is the second, independent (DB-level) half of that guarantee.
 */

export interface AdminRiderRow {
  id: string;
  playerId: string | null;
  isAi: boolean;
  firstName: string;
  surname: string;
  countryName: string;
  countryIso2: string;
  age: number;
  inferredArchetype: string;
  attributes: Record<SkillAttribute, number>;
  condition: Record<'energy' | 'fatigue' | 'form' | 'fitness' | 'morale', number>;
  conditionPrevious: Record<'energy' | 'fatigue' | 'form' | 'fitness' | 'morale', number>;
  /** True/raw potential — never sent to a player-facing view. See lib/rider/playerView.ts. */
  potential: number;
  trainability: number;
  professionalism: number;
  recovery: number;
  generatorVersion: string;
  createdAt: string;
}

function fromRow(row: Record<string, unknown>): AdminRiderRow {
  return {
    id: row.id as string,
    playerId: (row.player_id as string) ?? null,
    isAi: Boolean(row.is_ai),
    firstName: row.first_name as string,
    surname: row.surname as string,
    countryName: row.country_name as string,
    countryIso2: row.country_iso2 as string,
    age: row.age as number,
    inferredArchetype: row.inferred_archetype as string,
    attributes: row.attributes as AdminRiderRow['attributes'],
    condition: row.condition as AdminRiderRow['condition'],
    conditionPrevious: row.condition_previous as AdminRiderRow['conditionPrevious'],
    potential: row.potential as number,
    trainability: row.trainability as number,
    professionalism: row.professionalism as number,
    recovery: row.recovery as number,
    generatorVersion: row.generator_version as string,
    createdAt: row.created_at as string,
  };
}

/**
 * Every rider in the database, raw. Relies entirely on `riders_select_admin`
 * — callers MUST still gate the page itself with requireAdmin() from
 * lib/admin/auth.ts; this function does not check admin status itself (it
 * cannot meaningfully "deny" a non-admin — RLS just quietly returns less).
 */
export async function getAdminRiderRawList(): Promise<AdminRiderRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('riders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data.map(fromRow);
}

/** One rider, raw, by id — same RLS dependency as getAdminRiderRawList(). */
export async function getAdminRiderRawById(id: string): Promise<AdminRiderRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('riders')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  return fromRow(data);
}
