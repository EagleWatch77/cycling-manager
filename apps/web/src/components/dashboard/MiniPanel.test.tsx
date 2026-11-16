/**
 * Home dashboard small windows: intentional empty state (dash only), real rows, links only with data.
 * Run: npx tsx --tsconfig tsconfig.json src/components/dashboard/MiniPanel.test.tsx
 */
import '../BikeCard.setup';
import { renderToStaticMarkup } from 'react-dom/server';
import { MiniPanel } from './MiniPanel';
import fs from 'node:fs';
import path from 'node:path';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n, d); } };

const empty = renderToStaticMarkup(<MiniPanel icon="coin" title="Financie" href="/finance" linkLabel="Detail" />);
check('empty window: title + single dash', empty.includes('Financie') && empty.includes('data-empty="true"') && empty.includes('>—<'));
check('empty window: no link, no button even if href given', !empty.includes('<a ') && !empty.includes('<button'));
check('empty window: no "coming soon" text or illustration', !/Pripravujeme|coming soon|<img/i.test(empty));
check('empty window stays short (no tall padding classes)', !/py-(6|8|10|12)/.test(empty));

const filled = renderToStaticMarkup(<MiniPanel icon="cart" title="Trh jazdcov" rows={[{ key: 'a', label: 'Voľní jazdci', value: 12 }]} href="/transfers" linkLabel="Detail" />);
check('rows window: label and value shown', filled.includes('Voľní jazdci') && filled.includes('>12<') && !filled.includes('data-empty'));
check('rows window: functional link', filled.includes('href="/transfers"') && filled.includes('Detail'));
const noLink = renderToStaticMarkup(<MiniPanel icon="cart" title="X" rows={[{ key: 'a', label: 'L', value: '—' }]} />);
check('no href: no link rendered', !noLink.includes('<a '));

// Page wiring (final layout): exactly these windows, nothing else.
const page = fs.readFileSync(path.join(process.cwd(), 'src/app/dashboard/page.tsx'), 'utf8');
const jsx = page.slice(page.indexOf('return (\n    <AppShell'));
const used = [...jsx.matchAll(/<(LiveRaceCard|RiderSummaryCard|TourPreviewCard|SeasonCalendarCard|BikeCard|MiniPanel|[A-Z]\w+Card)\b/g)].map((m) => m[1]);
check('layout has exactly 9 windows', used.length === 9, used.join(','));
check('window set: live, rider, tour, calendar, bike, 4 mini', ['LiveRaceCard', 'RiderSummaryCard', 'TourPreviewCard', 'SeasonCalendarCard', 'BikeCard'].every((c) => used.includes(c)) && used.filter((c) => c === 'MiniPanel').length === 4);
check('removed windows are not on Home', !/TrainingOverviewCard|ManagerTasksCard|StandingsCard|RaceAnalysisCard|Hľadaj|morale|Morálka/i.test(jsx));
const order = ['sponsorsTitle', 'tasksTitle', 'technicalDirectorTitle'].map((k) => jsx.indexOf(k));
check('bottom row order: Sponzori, Manažérske úlohy, Technický riaditeľ', order[0] < order[1] && order[1] < order[2]);
for (const k of ['dashboard.sponsorsTitle', 'dashboard.tasksTitle', 'dashboard.technicalDirectorTitle']) {
  const line = jsx.split('\n').find((l) => l.includes(`t('${k}')`)) ?? '';
  check(`empty window "${k}" has no rows/href`, line !== '' && !/rows=|href=/.test(line), line);
}
const grid = ['lg:col-span-8', 'lg:col-span-4 lg:col-start-9', 'lg:col-span-3', 'lg:col-span-5'];
check('desktop grid: 8/4 split, calendar 3 + tour 5', grid.every((g) => jsx.includes(g)));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
