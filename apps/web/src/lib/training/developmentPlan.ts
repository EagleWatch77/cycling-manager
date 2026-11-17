import { createClient } from '@/lib/supabase/server';
import { trainingTarget } from '@/lib/calendar/weekKind';
import type { TrainingMode } from '@/lib/training/development/config';

/**
 * Seven training plans (V2): the manager picks ONE plan + a mode (Full / Basic). The database function save_my_development_plan() is the only write
 * path; it derives the rider, season and week itself (nothing but plan id and mode comes from the client). The page uses this only while
 * public.development_model_enabled() is true; otherwise the old single-focus form stays.
 */
export interface DevelopmentPlanRow { planId: number; mode: TrainingMode; seasonId: string; weekNumber: number; applied: boolean }

export type SaveDevelopmentPlanResult =
  | { ok: true; plan: DevelopmentPlanRow }
  | { ok: false; reason: 'no-rider' | 'invalid' | 'tour-conflict' | 'no-plannable-week' | 'already-processed' | 'disabled' | 'error' };

export { PLAN_OF_OLD_FOCUS, preselectFromOldPlan } from './oldPlanMap';

export async function isDevelopmentModelEnabled(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('development_model_enabled');
  return !error && data === true;
}

const fromRow = (r: Record<string, unknown>): DevelopmentPlanRow => ({
  planId: r.plan_id as number, mode: r.mode as TrainingMode, seasonId: r.season_id as string, weekNumber: r.week_number as number, applied: r.applied_at != null,
});

/** The open plan window right now (display mirror of public.training_target_week). null = the next week is a race week. */
export const currentPlanTarget = (now: Date = new Date()) => {
  const t = trainingTarget(now);
  return t ? { seasonId: `season-${t.seasonNumber}`, week: t.week } : null;
};

export async function getDevelopmentPlan(seasonId: string, week: number): Promise<{ plan: DevelopmentPlanRow | null; oldFocus: { focus: string; intensity: string } | null }> {
  const supabase = await createClient();
  const { data } = await supabase.from('training_plans').select('*').eq('season_id', seasonId).eq('week_number', week).maybeSingle();
  if (!data) return { plan: null, oldFocus: null };
  const row = data as Record<string, unknown>;
  return row.plan_id != null
    ? { plan: fromRow(row), oldFocus: null }
    : { plan: null, oldFocus: { focus: row.focus as string, intensity: row.intensity as string } };
}

export async function saveDevelopmentPlan(planId: number, mode: TrainingMode): Promise<SaveDevelopmentPlanResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_my_development_plan', { p_plan_id: planId, p_mode: mode });
  if (error) {
    const m = error.message ?? '';
    if (m.includes('no_rider')) return { ok: false, reason: 'no-rider' };
    if (m.includes('invalid_focus')) return { ok: false, reason: 'invalid' };
    if (m.includes('tour_conflict')) return { ok: false, reason: 'tour-conflict' };
    if (m.includes('no_plannable_week')) return { ok: false, reason: 'no-plannable-week' };
    if (m.includes('already_processed')) return { ok: false, reason: 'already-processed' };
    if (m.includes('model_disabled')) return { ok: false, reason: 'disabled' };
    return { ok: false, reason: 'error' };
  }
  if (!data) return { ok: false, reason: 'error' };
  return { ok: true, plan: fromRow(data as Record<string, unknown>) };
}
