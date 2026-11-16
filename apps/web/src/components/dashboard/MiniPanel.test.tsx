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

// Page wiring: every requested window is on the Home page, empty ones carry no data/link props.
const page = fs.readFileSync(path.join(process.cwd(), 'src/app/dashboard/page.tsx'), 'utf8');
const need = ['nav.finance', 'dashboard.sponsorsTitle', 'nav.staff', 'nav.transfers', 'nav.facilities', 'ranking.tabAchievements', 'dashboard.newsTitle', 'analysis.title', 'dashboard.resultsTitle', 'dashboard.divisionTitle'];
check('all requested windows are on the page', need.every((k) => page.includes(`t('${k}')`)));
for (const k of ['nav.finance', 'dashboard.sponsorsTitle', 'nav.staff', 'ranking.tabAchievements', 'dashboard.newsTitle', 'analysis.title']) {
  const line = page.split('\n').find((l) => l.includes(`t('${k}')`) && l.includes('MiniPanel')) ?? '';
  check(`empty window "${k}" has no rows/href`, line !== '' && !/rows=|href=/.test(line), line);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
