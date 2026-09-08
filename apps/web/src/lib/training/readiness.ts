/**
 * Readiness V1 — Unified Weekly Training V1 (see the chat report, item 17).
 * Pure functions, no I/O. Current Energy/Fatigue are no longer decorative:
 * before a weekly plan's raw growth is computed, its EFFECTIVENESS is
 * scaled by how rested the rider currently is. The authoritative
 * computation lives in process_training_plan() (supabase/schema.sql, using
 * the rider's condition as persisted BEFORE this week's own training
 * cost/recovery are applied); this file is the unit-tested TS mirror.
 *
 * Never player-facing as a multiplier or a raw score — only the qualitative
 * label (readinessLabel) is ever shown in the UI (item 17: "Player-facing
 * NEUKAZUJ multiplier").
 */

export function readinessScore(energy: number, fatigue: number): number {
  return (energy + (100 - fatigue)) / 2;
}

/** Hidden training-effectiveness multiplier — never shown to the player directly. */
export function readinessEffectiveness(score: number): number {
  if (score >= 80) return 1.00;
  if (score >= 60) return 0.95;
  if (score >= 40) return 0.85;
  if (score >= 20) return 0.70;
  return 0.50;
}

export type ReadinessLabel = 'excellent' | 'good' | 'reduced' | 'poor' | 'veryPoor';

/** The only reader-facing readiness signal (see the chat report, item 17) — localized via i18n key `readiness.<label>`. */
export function readinessLabel(score: number): ReadinessLabel {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'reduced';
  if (score >= 20) return 'poor';
  return 'veryPoor';
}
