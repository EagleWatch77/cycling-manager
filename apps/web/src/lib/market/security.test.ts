/**
 * Free Market DTO security — Development + Rider Score foundation (see the
 * chat report, items 18-22, 31). Source-inspection test (no live DB — same
 * limitation as every other DB-level guarantee in this codebase's test
 * suite): verifies the DTO shape and its one construction site structurally,
 * so a future edit that accidentally leaks a raw field fails loudly here
 * before it ever reaches a browser.
 * Run with: npx tsx src/lib/market/security.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

const src = fs.readFileSync(path.join(__dirname, 'playerRepository.ts'), 'utf8');

// 1. MarketRiderView MUST include the two safe derived scores.
const viewInterface = src.match(/export interface MarketRiderView \{([\s\S]*?)\n\}/)?.[1] ?? '';
check('MarketRiderView interface exists', viewInterface.length > 0);
check('MarketRiderView includes riderOverall', /riderOverall:\s*number/.test(viewInterface));
check('MarketRiderView includes performanceScore', /performanceScore:\s*number/.test(viewInterface));

// 2. MarketRiderView must NOT declare any of the forbidden raw fields directly.
const forbiddenInView = ['potential:', 'trainability:', 'professionalism:', 'recovery:', 'attributes:'];
for (const field of forbiddenInView) {
  check(`MarketRiderView does NOT declare "${field}" as a field`, !viewInterface.includes(field), viewInterface);
}

// 3. toView() — the one function that builds what the browser actually
// receives for the list — must not return raw trainability/professionalism/
// recovery/exact potential/attributes. It legitimately READS `attributes`
// from the row (to compute the derived scores) but must never put it back
// on the returned object.
const toViewFn = src.match(/function toView\(row: Record<string, unknown>\): MarketRiderView \{([\s\S]*?)\n\}/)?.[1] ?? '';
check('toView() exists', toViewFn.length > 0);
check('toView() computes riderOverall(attributes)', /riderOverall\(attributes\)/.test(toViewFn));
check('toView() computes performanceScore(attributes)', /performanceScore\(attributes\)/.test(toViewFn));
check('toView()\'s returned object does not include a bare `attributes:` field (only potentialStars, a derived star bucket, is allowed)',
  !/\n\s*attributes,?\s*\n/.test(toViewFn) && !/attributes:\s*(row\.attributes|attributes)\s*,/.test(toViewFn.replace(/const attributes = row\.attributes.*?;/, '')));
check('toView() never returns raw trainability/professionalism/recovery fields',
  !/trainability:|professionalism:|recovery:/.test(toViewFn));
check('toView() never returns the raw potential number (only potentialStars, a 1-5 bucket, via potentialToStars())',
  !/potential:\s*row\.potential/.test(toViewFn) && /potentialStars:\s*potentialToStars/.test(toViewFn));

// 4. The scores are computed server-side (imported from lib/rider/score, a
// 'server-only'-free pure module, but only ever called from this
// 'server-only' repository file — never from a client component).
check('riderOverall/performanceScore are imported from lib/rider/score', /from '@\/lib\/rider\/score'/.test(src));
check('playerRepository.ts is marked server-only', /import 'server-only'/.test(src));

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
