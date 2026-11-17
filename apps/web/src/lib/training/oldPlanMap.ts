import type { TrainingMode } from '@/lib/training/development/config';

/** Old single-focus settings -> the plan that is PRESELECTED (never saved automatically): nobody loses a set training, nothing changes until confirmed. */
export const PLAN_OF_OLD_FOCUS: Record<string, number> = { climbing: 0, sprint: 1, timeTrial: 2, hills: 3, flat: 4, endurance: 5 };
export const preselectFromOldPlan = (focus: string | null | undefined, intensity: string | null | undefined): { planId: number; mode: TrainingMode } => ({
  planId: focus != null && focus in PLAN_OF_OLD_FOCUS ? PLAN_OF_OLD_FOCUS[focus] : 6,
  mode: intensity === 'hard' ? 'full' : 'basic',
});
