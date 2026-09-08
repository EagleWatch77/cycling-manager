/**
 * Zázemie V1 — centralized config math (Technical Center relative risk
 * reduction / repair discount, bike risk bands, upgrade prices).
 * Run with: npx tsx src/lib/facilities/config.test.ts
 */
import {
  applyRiskReduction, applyRepairDiscount, bikeRiskBand, upgradePrice,
  TECHNICAL_RISK_REDUCTION, TECHNICAL_REPAIR_DISCOUNT,
} from './config';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

// 1. Technical Center risk reduction is RELATIVE, never flat percentage points.
{
  const reduced = applyRiskReduction(5, 5); // base risk 5%, L5 = -20% relative
  check('5% * (1 - 0.20) = 4%, not 5% - 20 = -15%', Math.abs(reduced - 4) < 1e-9, `${reduced}`);
  check('L1 changes nothing', applyRiskReduction(5, 1) === 5);
}

// 2. Repair discount matches the brief's own example: base 24000, L5 -> 19200.
check('repair discount example: 24000 @ L5 -> 19200', applyRepairDiscount(24000, 5) === 19200, `${applyRepairDiscount(24000, 5)}`);
check('L1 repair discount is 0%', applyRepairDiscount(100000, 1) === 100000);

// 3. TECHNICAL_RISK_REDUCTION and TECHNICAL_REPAIR_DISCOUNT are monotonically increasing 1->5.
{
  const levels = [1, 2, 3, 4, 5] as const;
  const riskIncreasing = levels.every((l, i) => i === 0 || TECHNICAL_RISK_REDUCTION[l] > TECHNICAL_RISK_REDUCTION[levels[i - 1]]);
  const discountIncreasing = levels.every((l, i) => i === 0 || TECHNICAL_REPAIR_DISCOUNT[l] > TECHNICAL_REPAIR_DISCOUNT[levels[i - 1]]);
  check('risk reduction strictly increases with level', riskIncreasing);
  check('repair discount strictly increases with level', discountIncreasing);
}

// 4. Bike condition risk bands (item 10).
check('100 -> normal', bikeRiskBand(100) === 'normal');
check('75 -> normal (boundary)', bikeRiskBand(75) === 'normal');
check('74 -> elevated (boundary)', bikeRiskBand(74) === 'elevated');
check('50 -> elevated (boundary)', bikeRiskBand(50) === 'elevated');
check('49 -> high (boundary)', bikeRiskBand(49) === 'high');
check('25 -> high (boundary)', bikeRiskBand(25) === 'high');
check('24 -> veryHigh (boundary)', bikeRiskBand(24) === 'veryHigh');
check('0 -> veryHigh', bikeRiskBand(0) === 'veryHigh');

// 5. Upgrade price: undefined at level 5 (already max), defined below.
check('upgradePrice(training, 5) is undefined — already max', upgradePrice('training', 5) === undefined);
check('upgradePrice(training, 1) is a positive number', (upgradePrice('training', 1) ?? 0) > 0);

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
