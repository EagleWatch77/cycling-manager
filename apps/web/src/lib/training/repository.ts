import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getMyRider } from '@/lib/rider/repository';
import { MAX_TECHNICAL_WEEKS_PER_SEASON, type TrainingIntensity, type WeekType } from './config';

/**
 * Training V1 persistence — one row per Rider per season week
 * (public.training_plans, see supabase/schema.sql). A row with
 * `appliedAt: null` is scheduled but not yet processed: no season/week
 * rollover job exists yet to fill in gains, so every plan stays in that
 * state today. UNIQUE(rider_id, season_id, week_number) is what prevents
 * a duplicate training block for a week that already has one.
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

/** How many Technical weeks the current player's Rider has already used this season. */
export async function countTechnicalWeeksUsed(seasonId: string): Promise<number> {
  const rider = await getMyRider();
  if (!rider) return 0;

  const supabase = await createClient();
  const { count } = await supabase
    .from('training_plans')
    .select('id', { count: 'exact', head: true })
    .eq('rider_id', rider.id)
    .eq('season_id', seasonId)
    .eq('week_type', 'technical');

  return count ?? 0;
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
  | { ok: false; reason: 'no-rider' | 'race-week' | 'locked' | 'technical-limit' | 'error' };

/**
 * Saves (creates or edits) the current player's training plan for the given
 * season week. Refuses to schedule training in a race week, refuses to edit
 * a week other than the current one, and enforces the Technical-week season
 * cap. The unique constraint on (rider_id, season_id, week_number) is the
 * final backstop against a duplicate — this function upserts on that key.
 */
export async function saveTrainingPlan(input: {
  seasonId: string;
  weekNumber: number;
  weekType: WeekType;
  focus: string;
  intensity: TrainingIntensity;
  isRaceWeek: boolean;
  isCurrentWeek: boolean;
}): Promise<SaveTrainingResult> {
  const rider = await getMyRider();
  if (!rider) return { ok: false, reason: 'no-rider' };
  if (input.isRaceWeek) return { ok: false, reason: 'race-week' };
  if (!input.isCurrentWeek) return { ok: false, reason: 'locked' };

  if (input.weekType === 'technical') {
    const [used, existing] = await Promise.all([
      countTechnicalWeeksUsed(input.seasonId),
      getTrainingPlan(input.seasonId, input.weekNumber),
    ]);
    const alreadyCountedThisWeek = existing?.weekType === 'technical';
    if (used >= MAX_TECHNICAL_WEEKS_PER_SEASON && !alreadyCountedThisWeek) {
      return { ok: false, reason: 'technical-limit' };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('training_plans')
    .upsert(
      {
        rider_id: rider.id,
        season_id: input.seasonId,
        week_number: input.weekNumber,
        week_type: input.weekType,
        focus: input.focus,
        intensity: input.intensity,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'rider_id,season_id,week_number' },
    )
    .select('*')
    .single();

  if (error || !data) return { ok: false, reason: 'error' };
  return { ok: true, plan: fromRow(data) };
}
