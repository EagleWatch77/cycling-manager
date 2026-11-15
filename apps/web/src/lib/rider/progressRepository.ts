import { createClient } from '@/lib/supabase/server';
import { isPremiumEntitled } from '@/lib/premium/entitlement';
import { toAttributes, type Attributes, type BaselineKind, type HistoryPoint, type HistorySource } from './progress';

export type RiderBaseline = { kind: BaselineKind; attributes: Attributes; seasonId: string; week: number; at: string };
export type RiderProgressData = { baseline: RiderBaseline; history: HistoryPoint[] | null };

/**
 * The manager's baseline snapshot for their rider, plus (Premium only) the real
 * attribute history. Read-only; RLS already limits both tables to the caller's
 * own rows and the history table to Premium (migration 20261115_03), so the
 * isPremiumEntitled() check here only avoids a pointless query.
 *
 * Returns null when there is nothing to show — including when the migration is
 * not deployed yet (the query errors): the card simply does not render.
 */
export async function getMyRiderProgress(riderId: string): Promise<RiderProgressData | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: acq, error } = await supabase
    .from('rider_acquisitions')
    .select('id, kind, attributes, season_id, season_week, acquired_at')
    .eq('rider_id', riderId)
    .eq('manager_id', user.id)
    .order('acquired_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !acq) return null;
  const attributes = toAttributes(acq.attributes);
  if (!attributes || (acq.kind !== 'acquired' && acq.kind !== 'tracking_start')) return null;

  const baseline: RiderBaseline = {
    kind: acq.kind, attributes, seasonId: acq.season_id as string, week: acq.season_week as number, at: acq.acquired_at as string,
  };

  let history: HistoryPoint[] | null = null;
  if (await isPremiumEntitled()) {
    const { data: rows, error: hErr } = await supabase
      .from('rider_attribute_history')
      .select('attributes, source, season_id, season_week, recorded_at')
      .eq('acquisition_id', acq.id as string)
      .order('recorded_at', { ascending: true })
      .order('id', { ascending: true });
    if (!hErr && rows) {
      history = rows.flatMap((r) => {
        const a = toAttributes(r.attributes);
        if (!a) return [];
        return [{
          recordedAt: r.recorded_at as string, seasonId: r.season_id as string, week: r.season_week as number,
          source: r.source as HistorySource, attributes: a,
        }];
      });
    }
  }
  return { baseline, history };
}
