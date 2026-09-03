import { readFileSync } from 'node:fs';

interface Row {
  survived: boolean; catchKm: number | null; maxGap: number;
  finishGap: number | null; brkE: number; chsE: number;
  largest: number; splits: number; clamp: number;
}
type Cell = { label: string; runs: number; ms: number; out: Row[] };
const store: Record<string, Cell> = JSON.parse(readFileSync('/tmp/validate.json', 'utf8'));

/**
 * JSON.stringify turns NaN into null, and Number.isNaN(null) is false, so a
 * naive NaN filter lets nulls through and averages them as zero. Filter on
 * finite numbers instead.
 */
const finite = (x: unknown[]): number[] =>
  x.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const sd = (x: number[]) => { const m = mean(x); return Math.sqrt(mean(x.map(v => (v - m) ** 2))); };
const q = (x: number[], p: number) => { const s = [...x].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const wilson = (k: number, n: number): [number, number] => {
  const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n);
  const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [(c - h) / d * 100, (c + h) / d * 100];
};
const mmss = (s: number) => { if (s === null || Number.isNaN(s)) return 'n/a';
  const t = Math.round(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const BATCHES = 4;

console.log('\nSTATISTICAL VALIDATION — 180 s established breakaway');
console.log('K = 0.40 PROVISIONAL, Energy active, SmallVariance = 0, sigma(EP) = 12');
console.log('no constant tuned\n');

console.log('='.repeat(100));
console.log('  ID  scenario           survival    95% CI            batch spread (4 x 500)      runtime');
console.log('='.repeat(100));
let totalMs = 0;
for (const id of ['B0', 'B1', 'B2', 'B3', 'B4']) {
  const c = store[id]; if (!c) continue;
  totalMs += c.ms;
  const k = c.out.filter(r => r.survived).length;
  const [lo, hi] = wilson(k, c.out.length);
  const b = c.out.length / BATCHES;
  const rates = Array.from({ length: BATCHES }, (_, i) =>
    c.out.slice(i * b, (i + 1) * b).filter(r => r.survived).length / b * 100);
  console.log(`  ${id}  ${c.label.padEnd(18)} ${(k / c.out.length * 100).toFixed(2).padStart(7)} %  ` +
    `[${lo.toFixed(2).padStart(6)}, ${hi.toFixed(2).padStart(6)}]   ` +
    `${rates.map(r => r.toFixed(1).padStart(5)).join(' ')}   ` +
    `${(c.ms / 1000).toFixed(1).padStart(7)} s`);
}
console.log('='.repeat(100));

console.log('\n  ID   catch km (median, IQR, n)        max gap (median, IQR)        finish gap (median, IQR, n)');
console.log('-'.repeat(100));
for (const id of ['B0', 'B1', 'B2', 'B3', 'B4']) {
  const c = store[id]; if (!c) continue;
  const ck = c.out.map(r => r.catchKm).filter((x): x is number => x !== null);
  const mg = c.out.map(r => r.maxGap);
  const fg = c.out.map(r => r.finishGap).filter((x): x is number => x !== null);
  console.log(`  ${id}   ` +
    (ck.length ? `${q(ck, .5).toFixed(1).padStart(6)}  [${q(ck, .25).toFixed(1)}, ${q(ck, .75).toFixed(1)}]  n=${String(ck.length).padStart(4)}`
               : '  never caught             ').padEnd(33) +
    `${mmss(q(mg, .5)).padStart(6)}  [${mmss(q(mg, .25))}, ${mmss(q(mg, .75))}]`.padEnd(29) +
    (fg.length ? `${mmss(q(fg, .5)).padStart(6)}  [${mmss(q(fg, .25))}, ${mmss(q(fg, .75))}]  n=${fg.length}`
               : '   n/a (always caught)'));
}

console.log('\n  ID   break Energy      chaser Energy     diff     splits          largest pel.grp   clamp');
console.log('-'.repeat(100));
for (const id of ['B0', 'B1', 'B2', 'B3', 'B4']) {
  const c = store[id]; if (!c) continue;
  const be = finite(c.out.map(r => r.brkE)), ce = finite(c.out.map(r => r.chsE));
  const sp = c.out.map(r => r.splits), lg = c.out.map(r => r.largest), cl = c.out.map(r => r.clamp);
  const zeroClamp = cl.filter(v => v === 0).length / cl.length * 100;
  console.log(`  ${id}   ${mean(be).toFixed(2)} +/- ${sd(be).toFixed(2)}   ` +
    (ce.length ? `${mean(ce).toFixed(2)} +/- ${sd(ce).toFixed(2)}` : '     n/a       ').padEnd(17) +
    `${(ce.length ? (mean(be) - mean(ce)).toFixed(2) : 'n/a').padStart(6)}   ` +
    `${mean(sp).toFixed(2)} +/- ${sd(sp).toFixed(2)}`.padEnd(16) +
    `${mean(lg).toFixed(2)} +/- ${sd(lg).toFixed(2)}`.padEnd(18) +
    `${mean(cl).toFixed(2)} (${zeroClamp.toFixed(1)}% runs clean)`);
}

const b2 = store['B2'], b3 = store['B3'];
const s2 = b2.out.filter(r => r.survived).length / b2.out.length * 100;
const s3 = b3.out.filter(r => r.survived).length / b3.out.length * 100;
const [l2, h2] = wilson(b2.out.filter(r => r.survived).length, b2.out.length);
console.log(`\n${'='.repeat(100)}\nVERDICT`);
console.log(`  B2 in 15-25 % band          ${s2 >= 15 && s2 <= 25 ? 'PASS' : 'FAIL'}   (${s2.toFixed(2)} %, CI [${l2.toFixed(2)}, ${h2.toFixed(2)}])`);
console.log(`  B2 CI fully inside band     ${l2 >= 15 && h2 <= 25 ? 'PASS' : 'FAIL'}`);
console.log(`  B3 single-digit survival    ${s3 < 10 ? 'PASS' : 'FAIL'}   (${s3.toFixed(2)} %)`);
console.log(`  total runtime               ${(totalMs / 1000).toFixed(1)} s for ${Object.values(store).reduce((a, c) => a + c.runs, 0)} runs`);
console.log('='.repeat(100) + '\n');
