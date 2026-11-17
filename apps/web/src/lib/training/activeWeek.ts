import { sessionDaysOf } from '@/lib/training/state/core';
import { STATE_CONFIG } from '@/lib/training/state/config';
import { weekKind, PLAN_DEADLINE_HOUR_UTC } from '@/lib/calendar/weekKind';
import type { TrainingMode } from '@/lib/training/development/config';

/**
 * What the manager sees for the CURRENT game week (also after the Monday 18:00 UTC deadline, when the plan is locked): the confirmed plan, the mode and
 * the training days with their state. PURE - computed from the clock, the plan row and the week start; nothing is guessed about results.
 * Session instants are the same ones the database processes (sessionDaysOf / sessionHourUtc of the Rider State model).
 */
export type SessionStatus = 'done' | 'next' | 'planned';
export interface ActiveSession { day: number; at: Date; status: SessionStatus }
export type ActiveWeek =
  | { kind: 'race-week' }
  | { kind: 'no-plan'; editable: boolean }
  | { kind: 'legacy-plan' }
  | { kind: 'plan'; planId: number; mode: TrainingMode; sessions: ActiveSession[]; done: number; total: number; evaluationAt: Date; editable: boolean };

const DAY_MS = 86_400_000;

export function buildActiveWeek(input: {
  now: Date; weekNumber: number; weekStart: Date;
  plan: { planId: number; mode: TrainingMode } | null; hasLegacyPlan: boolean;
}): ActiveWeek {
  if (weekKind(input.weekNumber) === 'race') return { kind: 'race-week' };
  // The plan of a training week can be set and changed until Monday 18:00 UTC OF THAT WEEK (the first session is Tuesday 12:00): before that it is NOT locked.
  const editable = input.now.getTime() < input.weekStart.getTime() + PLAN_DEADLINE_HOUR_UTC * 3_600_000;
  if (!input.plan) return input.hasLegacyPlan ? { kind: 'legacy-plan' } : { kind: 'no-plan', editable };
  const days = sessionDaysOf(input.plan.mode);
  const instants = days.map((d) => new Date(input.weekStart.getTime() + d * DAY_MS + STATE_CONFIG.training.sessionHourUtc * 3_600_000));
  const firstOpen = instants.findIndex((t) => t.getTime() > input.now.getTime());
  const sessions = instants.map((at, i): ActiveSession => ({ day: days[i], at, status: at.getTime() <= input.now.getTime() ? 'done' : i === firstOpen ? 'next' : 'planned' }));
  return { kind: 'plan', planId: input.plan.planId, mode: input.plan.mode, sessions, done: sessions.filter((s) => s.status === 'done').length, total: sessions.length,
    evaluationAt: new Date(input.weekStart.getTime() + 7 * DAY_MS), editable };
}

/** The planner form is locked only when the plan was already processed or planning is blocked - a saved, unprocessed plan stays editable until the deadline. */
export const isPlanFormLocked = (saved: { applied: boolean } | null, blocked: string | null): boolean => saved?.applied === true || blocked != null;
