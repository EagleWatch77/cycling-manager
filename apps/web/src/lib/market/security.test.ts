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
check('MarketRiderView includes overallRating', /overallRating:\s*number/.test(viewInterface));
check('MarketRiderView has the single overall score only (no separate performanceScore)', !/performanceScore/.test(viewInterface));

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
check('toView() computes overallRating(attributes)', /overallRating\(attributes\)/.test(toViewFn));
check('toView() does not compute a separate performanceScore', !/performanceScore/.test(toViewFn));
check('toView()\'s returned object does not include a bare `attributes:` field (only potentialStars, a derived star bucket, is allowed)',
  !/\n\s*attributes,?\s*\n/.test(toViewFn) && !/attributes:\s*(row\.attributes|attributes)\s*,/.test(toViewFn.replace(/const attributes = row\.attributes.*?;/, '')));
check('toView() never returns raw trainability/professionalism/recovery fields',
  !/trainability:|professionalism:|recovery:/.test(toViewFn));
check('toView() never returns the raw potential number (only potentialStars, the 1-5 bucket computed by the database)',
  !/potential:\s*row\.potential\b/.test(toViewFn) && /potentialStars:\s*row\.potential_stars/.test(toViewFn));

// 4. The scores are computed server-side (imported from lib/rider/score, a
// 'server-only'-free pure module, but only ever called from this
// 'server-only' repository file — never from a client component).
check('overallRating is imported from lib/rider/score', /from '@\/lib\/rider\/score'/.test(src));
check('playerRepository.ts is marked server-only', /import 'server-only'/.test(src));

// 5. O-011: the player-facing repository reads ONLY granted public columns (hidden columns are not selectable by `authenticated`).
const HIDDEN_COLS = ['potential', 'trainability', 'professionalism', 'recovery', 'vitality', 'aptitude_profile', 'energy_efficiency', 'fatigue_resistance',
  'recovery_coef', 'fitness_peak', 'condition', 'generator_version', 'source', 'generated_at', 'acquired_by_player_id', 'acquired_at'];
const publicCols = src.match(/MARKET_PUBLIC_COLUMNS\s*=\s*'([^']*)'/)?.[1] ?? '';
check('MARKET_PUBLIC_COLUMNS constant exists', publicCols.length > 0);
check('public columns include potential_stars (database-computed bucket)', publicCols.split(',').map((c) => c.trim()).includes('potential_stars'));
check('public columns contain no hidden column', !publicCols.split(',').map((c) => c.trim()).some((c) => HIDDEN_COLS.includes(c)), publicCols);
const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
check("player repository never uses select('*')", !/select\(\s*'\*'/.test(codeOnly));
const usedCols = [...codeOnly.matchAll(/\.(?:eq|neq|gt|gte|lt|lte|order|ilike)\(\s*'([a-z_]+)'/g)].map((m) => m[1]);
const sortCols = [...(codeOnly.match(/const SORT_COLUMN[\s\S]*?\n\};/)?.[0] ?? '').matchAll(/:\s*'([a-z_]+)'/g)].map((m) => m[1]);
check('player repository never filters or sorts by a hidden column', usedCols.length > 0 && sortCols.length === 5 && ![...usedCols, ...sortCols].some((c) => HIDDEN_COLS.includes(c)), [...usedCols, ...sortCols].join());
check('stars filter and sort use potential_stars', /eq\('potential_stars'/.test(src) && /potential:\s*'potential_stars'/.test(src));
const adminSrc = fs.readFileSync(path.join(__dirname, 'repository.ts'), 'utf8');
check("admin repository reads full rows only through the admin_market_riders() function (no select('*') on the table)", /rpc\('admin_market_riders'/.test(adminSrc) && !/select\(\s*'\*'/.test(adminSrc));
check('admin summary does not select hidden columns directly from the table', !/\.select\('tier, status, generated_at, source'\)/.test(adminSrc));

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
