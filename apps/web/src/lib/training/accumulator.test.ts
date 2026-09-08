/**
 * Training Progress Accumulator V1 — exact examples from the request.
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

check('canonical threshold is 1.0', TRAINING_GAIN_THRESHOLD === 1.0);

// 1. 0 + 0.40 => gain 0, progress 0.40 (exact example from the request).
{
  const r = accumulateProgress(0, 0.40);
  check('0 + 0.40 -> gain 0', r.gain === 0, `${r.gain}`);
  check('0 + 0.40 -> remaining 0.40', Math.abs(r.remainingProgress - 0.40) < 1e-9, `${r.remainingProgress}`);
}

// 2. Next training: 0.40 + 0.70 => gain 1, progress 0.10.
{
  const r = accumulateProgress(0.40, 0.70);
  check('0.40 + 0.70 -> gain 1', r.gain === 1, `${r.gain}`);
  check('0.40 + 0.70 -> remaining 0.10', Math.abs(r.remainingProgress - 0.10) < 1e-9, `${r.remainingProgress}`);
}

// 3. 0.80 + 1.50 => gain 2, progress 0.30 (multiple whole points from one training).
{
  const r = accumulateProgress(0.80, 1.50);
  check('0.80 + 1.50 -> gain 2', r.gain === 2, `${r.gain}`);
  check('0.80 + 1.50 -> remaining 0.30', Math.abs(r.remainingProgress - 0.30) < 1e-9, `${r.remainingProgress}`);
}

// 4. Floating point precision: a long chain of small accumulations must
// still land on the exact right whole-number gain, not drift.
{
  let progress = 0;
  let totalGain = 0;
  for (let i = 0; i < 10; i++) {
    const r = accumulateProgress(progress, 0.3);
    progress = r.remainingProgress;
    totalGain += r.gain;
  }
  // 10 * 0.3 = 3.0 exactly -> should yield exactly 3 whole gains over the run.
  check('10x accumulateProgress(_, 0.3) sums to exactly 3 whole gains', totalGain === 3, `${totalGain}`);
  check('no leftover drift beyond floating-point epsilon', progress < 1e-9, `${progress}`);
}

// 5. Never negative gain, never negative remaining progress, for realistic (non-negative) inputs.
{
  const r = accumulateProgress(0, 0.05);
  check('tiny raw growth never produces a negative gain', r.gain >= 0);
  check('tiny raw growth never produces negative remaining progress', r.remainingProgress >= 0);
}

// 6. Custom threshold override still works (canonical default stays 1.0, but the function accepts an explicit one).
{
  const r = accumulateProgress(1.5, 1.0, 2.0);
  check('custom threshold 2.0: 1.5 + 1.0 = 2.5 -> gain 1', r.gain === 1, `${r.gain}`);
  check('custom threshold 2.0: remaining 0.5', Math.abs(r.remainingProgress - 0.5) < 1e-9, `${r.remainingProgress}`);
}

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
