/**
 * Home bike card: wear display, status bands, service alert, missing data,
 * link to the existing bike page. Run: npx tsx --tsconfig tsconfig.json src/components/BikeCard.test.tsx
 */
import './BikeCard.setup';
import { renderToStaticMarkup } from 'react-dom/server';
import { BikeCard } from './BikeCard';
import { wearPct, componentStatus, buildComponentView, attentionCount } from '@/lib/facilities/bikeDisplay';
import { BIKE_COMPONENT_STATUS } from '@/lib/facilities/config';
import { NEW_BIKE_ROWS } from './BikeCard.fixtures';
import sk from '@/i18n/messages/sk.json';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n, d); } };
const t = ((k: string, v?: Record<string, string | number>) => ((sk as Record<string, string>)[k] ?? k).replace(/\{(\w+)\}/g, (_: string, n: string) => String(v?.[n] ?? ''))) as never;
const views = (c: { tires: number; brakes: number; drivetrain: number }) => [
  buildComponentView({ id: 'wheels', condition: null, level: null }),
  buildComponentView({ id: 'tires', condition: c.tires, level: null }),
  buildComponentView({ id: 'brakes', condition: c.brakes, level: null }),
  buildComponentView({ id: 'drivetrain', condition: c.drivetrain, level: null }),
];

// 1. New bike = 0 % wear, all OK, no alert.
{
  const v = views({ tires: 100, brakes: 100, drivetrain: 100 });
  const html = renderToStaticMarkup(<BikeCard t={t} items={v} />);
  check('new bike: three stored components show 0 %', (html.match(/0 %/g) ?? []).length === 3);
  check('new bike: no service alert', !html.includes('role="status"') && attentionCount(v) === 0);
  check('new bike: all stored components OK', v.filter((x) => x.id !== 'wheels').every((x) => x.status === 'ok'));
}
// 2. Mixed wear: stored condition 82/55/30 -> wear 18/45/70, statuses ok/service/maintenance.
{
  check('wear = 100 - condition', wearPct(82) === 18 && wearPct(55) === 45 && wearPct(30) === 70 && wearPct(100) === 0 && wearPct(0) === 100);
  check('status bands follow existing risk bands', componentStatus(75) === 'ok' && componentStatus(74) === 'service' && componentStatus(50) === 'service' && componentStatus(49) === 'maintenance' && componentStatus(0) === 'maintenance');
  check('status mapping is the central config', BIKE_COMPONENT_STATUS.normal === 'ok' && BIKE_COMPONENT_STATUS.veryHigh === 'maintenance');
  const v = views({ tires: 82, brakes: 55, drivetrain: 30 });
  const html = renderToStaticMarkup(<BikeCard t={t} items={v} />);
  check('mixed: shows 18 %, 45 %, 70 %', html.includes('18 %') && html.includes('45 %') && html.includes('70 %'));
  check('mixed: Servis and Údržba labels', html.includes('Servis') && html.includes('Údržba'));
  // 3. Alert counts the two worn components.
  check('alert: 2 components need service', attentionCount(v) === 2 && html.includes('Potrebujú servis: 2'));
}
// 4. Missing data: wheels unknown never counted or invented; no bike data = empty state, no numbers.
{
  const v = views({ tires: 100, brakes: 100, drivetrain: 100 });
  const w = v.find((x) => x.id === 'wheels')!;
  check('wheels unknown: wear/status null', w.wear === null && w.status === null);
  const html = renderToStaticMarkup(<BikeCard t={t} items={v} />);
  check('no level column when no level data', !html.includes('Úroveň'));
  const empty = renderToStaticMarkup(<BikeCard t={t} items={null} />);
  check('no bike data: empty state, no %', !empty.includes(' %') && empty.includes(sk['equipment.bikeEmpty']));
  check('no invented bike name/frame/weight', !/Rookie Road|kg|Hliník/.test(html));
}
// 5. Detail link goes to the existing bike page.
{
  const html = renderToStaticMarkup(<BikeCard t={t} items={NEW_BIKE_ROWS} />);
  check('link to /bike with the new label', html.includes('href="/bike"') && html.includes('Detail bicykla a servis'));
}
// 5b. Each tile links to the detail page with the component preselected.
{
  const html = renderToStaticMarkup(<BikeCard t={t} items={NEW_BIKE_ROWS} />);
  check('tiles link to /bike?component=', ['wheels', 'tires', 'brakes', 'drivetrain'].every((id) => html.includes(`href="/bike?component=${id}"`)));
}
// 6. Only the current manager's bike: the card renders exactly the rows it is given.
{
  const mine = views({ tires: 90, brakes: 90, drivetrain: 90 });
  const html = renderToStaticMarkup(<BikeCard t={t} items={mine} />);
  check('renders only given rows (4 components)', (html.match(/data-component=/g) ?? []).length === 4 && html.includes('10 %'));
}
// 7. Mobile: table has no fixed widths wider than the card; checked by markup (w-full, no min-w).
{
  const html = renderToStaticMarkup(<BikeCard t={t} items={NEW_BIKE_ROWS} />);
  check('responsive markup: 2 x 2 tile grid, no fixed widths', html.includes('grid grid-cols-2') && !/min-w-\[|w-\[\d+px\]/.test(html));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
