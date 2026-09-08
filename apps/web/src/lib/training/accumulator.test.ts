/**
 * Training Progress Accumulator — exact examples from the original brief,
 * now pinned to an explicit threshold=1.0 (the accumulator's OWN math is
 * threshold-agnostic; TRAINING_GAIN_THRESHOLD itself was raised to 12 for
 * Unified Weekly Training V1 — see the chat report, item 6 — so these
 * historical examples must no longer rely on the default).
 * The authoritative copy of this same math lives in
 * process_training_plan() (supabase/schema.sql, PL/pgSQL) — kept in sync
 * by hand; this file only verifies the pure TS mirror used for local
 * reasoning/tests, per the accumulator.ts doc comment.
 * Run with: npx tsx src/lib/training/accumulator.test.ts
 */
import { accumulateProgress } from './accumulator';
import { TRAINING_GAIN_THRESHOLD } from './config';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

check('canonical threshold is 12 (Unified Weekly Training V1 — was 1.0)', TRAINING_GAIN_THRESHOLD === 12);

// 1. 0 + 0.40 => gain 0, progress 0.40 (exact example from the original brief, threshold=1.0).
{
  const r = accumulateProgress(0, 0.40, 1.0);
  check('0 + 0.40 -> gain 0', r.gain === 0, `${r.gain}`);
  check('0 + 0.40 -> remaining 0.40', Math.abs(r.remainingProgress - 0.40) < 1e-9, `${r.remainingProgress}`);
}

// 2. Next training: 0.40 + 0.70 => gain 1, progress 0.10.
{
  const r = accumulateProgress(0.40, 0.70, 1.0);
  check('0.40 + 0.70 -> gain 1', r.gain === 1, `${r.gain}`);
  check('0.40 + 0.70 -> remaining 0.10', Math.abs(r.remainingProgress - 0.10) < 1e-9, `${r.remainingProgress}`);
}

// 3. 0.80 + 1.50 => gain 2, progress 0.30 (multiple whole points from one training).
{
  const r = accumulateProgress(0.80, 1.50, 1.0);
  check('0.80 + 1.50 -> gain 2', r.gain === 2, `${r.gain}`);
  check('0.80 + 1.50 -> remaining 0.30', Math.abs(r.remainingProgress - 0.30) < 1e-9, `${r.remainingProgress}`);
}

// 4. Floating point precision: a long chain of small accumulations must
// still land on the exact right whole-number gain, not drift.
{
  let progress = 0;
  let totalGain = 0;
  for (let i = 0; i < 10; i++) {
    const r = accumulateProgress(progress, 0.3, 1.0);
    progress = r.remainingProgress;
    totalGain += r.gain;
  }
  // 10 * 0.3 = 3.0 exactly -> should yield exactly 3 whole gains over the run.
  check('10x accumulateProgress(_, 0.3, 1.0) sums to exactly 3 whole gains', totalGain === 3, `${totalGain}`);
  check('no leftover drift beyond floating-point epsilon', progress < 1e-9, `${progress}`);
}

// 5. Never negative gain, never negative remaining progress, for realistic (non-negative) inputs.
{
  const r = accumulateProgress(0, 0.05, 1.0);
  check('tiny raw growth never produces a negative gain', r.gain >= 0);
  check('tiny raw growth never produces negative remaining progress', r.remainingProgress >= 0);
}

// 6. Custom threshold override still works (canonical default is now 12, but the function accepts an explicit one).
{
  const r = accumulateProgress(1.5, 1.0, 2.0);
  check('custom threshold 2.0: 1.5 + 1.0 = 2.5 -> gain 1', r.gain === 1, `${r.gain}`);
  check('custom threshold 2.0: remaining 0.5', Math.abs(r.remainingProgress - 0.5) < 1e-9, `${r.remainingProgress}`);
}

// 7. Default (no explicit threshold) now uses 12 — realistic weekly raw progress (a few points) takes several weeks to convert.
{
  const r = accumulateProgress(0, 2.0);
  check('default threshold (12): a single week\'s raw 2.0 -> gain 0 (banked, not lost)', r.gain === 0, `${r.gain}`);
  check('default threshold (12): remaining progress is exactly the raw value', Math.abs(r.remainingProgress - 2.0) < 1e-9, `${r.remainingProgress}`);
}

// 8. maxGain (Technical training's hard weekly cap — see the chat report, item 9): a total that would convert into 2+ points is capped at maxGain; the UNCONSUMED remainder stays banked, never lost, never inflating this call's gain.
{
  const r = accumulateProgress(20, 10, 12, 1); // total 30 -> uncapped gain would be floor(30/12)=2
  check('maxGain=1 caps the gain at 1 even though uncapped would be 2', r.gain === 1, `${r.gain}`);
  check('maxGain=1: remaining progress is total - 1*threshold = 18 (NOT lost, NOT reset to a sub-threshold value)', Math.abs(r.remainingProgress - 18) < 1e-9, `${r.remainingProgress}`);
}
{
  // The very next call (simulating "next week") should immediately be able to apply another +1 from the banked remainder, still respecting maxGain=1 each time.
  const first = accumulateProgress(20, 10, 12, 1);
  const second = accumulateProgress(first.remainingProgress, 0, 12, 1);
  check('a second capped call consumes another +1 from the banked remainder (18 -> gain 1, remaining 6)', second.gain === 1 && Math.abs(second.remainingProgress - 6) < 1e-9,
    `gain=${second.gain} remaining=${second.remainingProgress}`);
}
{
  const r = accumulateProgress(0, 5, 12, 1); // total 5 -> uncapped gain 0, cap irrelevant
  check('maxGain does not affect a call that would not have earned a point anyway', r.gain === 0 && Math.abs(r.remainingProgress - 5) < 1e-9);
}
{
  const r = accumulateProgress(0, 5); // no maxGain arg -> unlimited, same as before
  check('omitting maxGain behaves exactly as before (unlimited)', r.gain === 0 && Math.abs(r.remainingProgress - 5) < 1e-9);
}

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
