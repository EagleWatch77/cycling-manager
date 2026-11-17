import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getMyRider } from '@/lib/rider/repository';
import { type TrainingIntensity, type WeekType } from './config';

/**
 * Training V1 persistence — one row per Rider per season week
 * (public.training_plans, see supabase/schema.sql). A row with
 * `appliedAt: null` is scheduled but not yet processed; lib/training/engine.ts
 * fills in the gain columns and stamps `applied_at` once the plan's week has
 * passed. UNIQUE(rider_id, season_id, week_number) is what prevents a
 * duplicate training block for a week that already has one.
 */

export interface TrainingPlan {
  id: string;
  riderId: string;
  seasonId: string;
  weekNumber: number;
  weekType: WeekType;
  focus: string;
  intensity: TrainingIntensity;
  createdAt: string;
  updatedAt: string;
  primaryAttr: string | null;
  primaryGain: number | null;
  secondaryAttr: string | null;
  secondaryGain: number | null;
  appliedAt: string | null;
}

function fromRow(row: Record<string, unknown>): TrainingPlan {
  return {
    id: row.id as string,
    riderId: row.rider_id as string,
    seasonId: row.season_id as string,
    weekNumber: row.week_number as number,
    weekType: row.week_type as WeekType,
    focus: row.focus as string,
    intensity: row.intensity as TrainingIntensity,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    primaryAttr: (row.primary_attr as string) ?? null,
    primaryGain: (row.primary_gain as number) ?? null,
    secondaryAttr: (row.secondary_attr as string) ?? null,
    secondaryGain: (row.secondary_gain as number) ?? null,
    appliedAt: (row.applied_at as string) ?? null,
  };
}

/** The current player's training plan for one season week, or null if none is saved yet. */
export async function getTrainingPlan(seasonId: string, weekNumber: number): Promise<TrainingPlan | null> {
  const rider = await getMyRider();
  if (!rider) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('training_plans')
    .select('*')
    .eq('rider_id', rider.id)
    .eq('season_id', seasonId)
    .eq('week_number', weekNumber)
    .maybeSingle();

  if (error || !data) return null;
  return fromRow(data);
}

/** The most recent completed (applied) training blocks — real outcomes only, never predictions. */
export async function listRecentCompletedTrainings(limit = 3): Promise<TrainingPlan[]> {
  const rider = await getMyRider();
  if (!rider) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('training_plans')
    .select('*')
    .eq('rider_id', rider.id)
    .not('applied_at', 'is', null)
    .order('applied_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map(fromRow);
}

export type SaveTrainingResult =
  | { ok: true; plan: TrainingPlan }
  | { ok: false; reason: 'no-rider' | 'invalid-focus' | 'already-planned' | 'tour-conflict' | 'no-plannable-week' | 'legacy-closed' | 'error' };

/**
 * Saves the current player's training plan for the one week that's ever
 * plannable — current week + 1, capped at the season's last week.
 *
 * Stage E1 (migration 04): this is now a thin call to the database function
 * save_my_training_plan(), which is the ONLY write path to training_plans. The
 * caller sends nothing but type / focus / intensity: the player comes from
 * auth, the season and week from the SQL calendar, and the type↔focus↔intensity
 * pairing, rider ownership and "a processed plan is history" are enforced there
 * (see supabase/tests/training_security.test.sh). Races never gate planning.
 *
 * Unified Weekly Training V1: exactly ONE plan per rider and week —
 *   - 'performance': focus in PERFORMANCE_FOCUS, intensity Light/Normal/Hard.
 *   - 'technical': focus in TECHNICAL_FOCUS; intensity has no player-facing
 *     meaning (stored as the 'light' placeholder).
 * A confirmed plan is final (migration 05): a second save is rejected as
 * 'already-planned', and a week in which the rider is registered for a Tour
 * is rejected as 'tour-conflict' (the Tour registration is blocked the same
 * way in the other direction).
 */
export async function saveTrainingPlan(input: {
  weekType: WeekType;
  focus: string;
  intensity: TrainingIntensity;
}): Promise<SaveTrainingResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_my_training_plan', {
    p_week_type: input.weekType,
    p_focus: input.focus,
    p_intensity: input.intensity,
  });

  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('no_rider')) return { ok: false, reason: 'no-rider' };
    if (msg.includes('invalid_focus')) return { ok: false, reason: 'invalid-focus' };
    if (msg.includes('already_planned')) return { ok: false, reason: 'already-planned' };
    if (msg.includes('tour_conflict')) return { ok: false, reason: 'tour-conflict' };
    if (msg.includes('no_plannable_week')) return { ok: false, reason: 'no-plannable-week' };
    if (msg.includes('legacy_planning_closed')) return { ok: false, reason: 'legacy-closed' };
    return { ok: false, reason: 'error' };
  }
  if (!data) return { ok: false, reason: 'error' };
  return { ok: true, plan: fromRow(data as Record<string, unknown>) };
}
