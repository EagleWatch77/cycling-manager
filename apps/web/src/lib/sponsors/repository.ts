import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { GoalPair, GoalType, SponsorContract, SponsorKind, SponsorOffer } from './rules';

export interface SponsorData {
  contracts: SponsorContract[];
  offers: SponsorOffer[];
  economyEnabled: boolean;
  /** company of the most recently signed contract (any kind) — for the "not twice in a row" rule */
  lastSignedCompanyId: string | null;
  /** false when the sponsor tables do not exist yet (migration 20261122_01 not run) */
  available: boolean;
}

const EMPTY: SponsorData = { contracts: [], offers: [], economyEnabled: false, lastSignedCompanyId: null, available: false };

interface OfferRow {
  id: string; company_id: string; kind: SponsorKind; duration_weeks: number; weekly_income_cents: number | null;
  goal1_type: GoalType; goal1_bonus_cents: number | null; goal2_type: GoalType; goal2_bonus_cents: number | null;
  expires_at: string; sponsor_companies: { name: string } | { name: string }[] | null;
}
interface ContractRow extends Omit<OfferRow, 'expires_at'> { signed_at: string; ends_at: string }

const nameOf = (c: OfferRow['sponsor_companies']) => (Array.isArray(c) ? c[0]?.name : c?.name) ?? '—';
const pairOf = (r: OfferRow | ContractRow): GoalPair => [
  { type: r.goal1_type, bonusCents: r.goal1_bonus_cents }, { type: r.goal2_type, bonusCents: r.goal2_bonus_cents },
];

/**
 * The signed-in player's REAL sponsor data. Row-level security returns only this player's rows (the page never filters by a
 * client-supplied id). Before the migration exists, or on any read error, the page simply shows its empty state.
 */
export async function getMySponsorData(now: Date = new Date()): Promise<SponsorData> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return EMPTY;

  const cols = 'id, company_id, kind, duration_weeks, weekly_income_cents, goal1_type, goal1_bonus_cents, goal2_type, goal2_bonus_cents';
  const [offers, contracts, settings] = await Promise.all([
    supabase.from('sponsor_offers').select(`${cols}, expires_at, sponsor_companies(name)`)
      .eq('status', 'open').gt('expires_at', now.toISOString()).order('expires_at', { ascending: true }),
    supabase.from('sponsor_contracts').select(`${cols}, signed_at, ends_at, sponsor_companies(name)`)
      .eq('status', 'active').order('signed_at', { ascending: false }),
    supabase.from('sponsor_settings').select('economy_enabled').maybeSingle(),
  ]);
  if (offers.error || contracts.error) {
    // 42P01 = table missing (migration not applied yet): quiet empty state; anything else is logged.
    const e = offers.error ?? contracts.error;
    if (e && e.code !== '42P01' && e.code !== 'PGRST205') console.error(`[sponsors] read failed: code=${e.code} message=${e.message}`);
    return EMPTY;
  }

  const last = await supabase.from('sponsor_contracts').select('company_id').order('signed_at', { ascending: false }).limit(1).maybeSingle();
  return {
    available: true,
    economyEnabled: settings.data?.economy_enabled === true,
    lastSignedCompanyId: (last.data?.company_id as string | undefined) ?? null,
    offers: ((offers.data ?? []) as unknown as OfferRow[]).map((r) => ({
      id: r.id, isDemo: false, companyId: r.company_id, companyName: nameOf(r.sponsor_companies), kind: r.kind,
      durationWeeks: r.duration_weeks, weeklyIncomeCents: r.weekly_income_cents, goals: pairOf(r), expiresAt: r.expires_at,
    })),
    contracts: ((contracts.data ?? []) as unknown as ContractRow[]).map((r) => ({
      id: r.id, isDemo: false, companyId: r.company_id, companyName: nameOf(r.sponsor_companies), kind: r.kind,
      signedAt: r.signed_at, endsAt: r.ends_at, durationWeeks: r.duration_weeks, weeklyIncomeCents: r.weekly_income_cents, goals: pairOf(r),
    })),
  };
}

/** Rejects one of the player's own open offers (the database checks the owner; no money moves). */
export async function rejectMySponsorOffer(offerId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('reject_my_sponsor_offer', { p_offer_id: offerId });
  if (error) { console.error(`[sponsors] reject failed: code=${error.code} message=${error.message}`); return false; }
  return data === true;
}
