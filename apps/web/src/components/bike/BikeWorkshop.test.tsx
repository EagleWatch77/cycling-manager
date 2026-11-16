import '../BikeCard.setup';
import { renderToStaticMarkup } from 'react-dom/server';
import { BikeWorkshop, type WorkshopComponent } from './BikeWorkshop';
import { BIKE_EQUIPMENT_IDS } from '@/lib/bike/equipment';
import sk from '@/i18n/messages/sk.json';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n, d); } };
const messages: Record<string, string> = {};
for (const [k, v] of Object.entries(sk as Record<string, string>)) if (/^(bikePage\.|league\.|bikeCard\.status)/.test(k)) messages[k] = v;
const comps: WorkshopComponent[] = [
  { id: 'frame', level: 1, wear: null, status: null },
  { id: 'wheels', level: 1, wear: null, status: null },
  { id: 'tires', level: 1, wear: 18, status: 'ok' },
  { id: 'brakes', level: 1, wear: 45, status: 'service' },
  { id: 'drivetrain', level: 1, wear: 70, status: 'maintenance' },
];
const render = (over: Partial<Parameters<typeof BikeWorkshop>[0]> = {}) =>
  renderToStaticMarkup(<BikeWorkshop components={comps} league="rookie" messages={messages} initialSelected="frame" weightKg={null} kilometres={null} {...over} />);

{
  const h = render();
  check('5 callouts + 5 bottom tiles', BIKE_EQUIPMENT_IDS.every((id) => h.includes(`data-callout="${id}"`) && h.includes(`data-tile="${id}"`)));
  check('title + bike name', h.includes('Cestný bicykel') && !h.includes('9,2'));
  check('frame selected: detail panel for the frame', h.includes('data-selected="frame"') && h.includes('Rám – detail'));
  check('frame: wear dash, never a percentage', /data-testid="detail-wear">—</.test(h));
  check('stats: weight and km are dashes', /data-stat="weight"[^>]*>.*?<dd[^>]*>—<\/dd>/.test(h) && /data-stat="km"[^>]*>.*?<dd[^>]*>—<\/dd>/.test(h));
  check('frame material shown: Oceľový rám', h.includes('Oceľový rám'));
  check('upgrades 0 / 5 in Rookie', h.includes('0 / 5'));
  check('both tabs present, upgrade tab active', h.includes('Vylepšenie') && h.includes('Servis / oprava') && h.includes('data-testid="upgrade-tab"'));
}
{
  const h = render();
  const state = (n: number) => new RegExp(`data-level="${n}" data-state="(\\w+)"`).exec(h)?.[1];
  check('Rookie: level 1 owned, 2 open, 3..10 locked', state(1) === 'owned' && state(2) === 'open' && [3, 4, 5, 6, 7, 8, 9, 10].every((n) => state(n) === 'locked'));
  check('locked levels carry unlock league in title', h.includes('Odomkne sa v lige Amatér') && h.includes('Odomkne sa v lige Elite'));
  check('lock note present', h.includes('data-testid="lock-note"'));
  check('price is a dash, CTA disabled', h.includes('data-testid="price">— €') && /<button type="button" disabled=""[^>]*data-testid="upgrade-cta"/.test(h));
}
{
  const h = render({ league: 'amateur' });
  const state = (n: number) => new RegExp(`data-level="${n}" data-state="(\\w+)"`).exec(h)?.[1];
  check('Amateur: 2-4 open, 5+ locked', [2, 3, 4].every((n) => state(n) === 'open') && state(5) === 'locked');
  const e = render({ league: 'elite' });
  check('Elite: nothing locked', !e.includes('data-state="locked"') && !e.includes('data-testid="lock-note"'));
}
{
  const h = render({ initialSelected: 'brakes' });
  check('?component=brakes: brakes detail with 45 %', h.includes('data-selected="brakes"') && /data-testid="detail-wear">45 %</.test(h));
  const w = render({ initialSelected: 'wheels' });
  check('wheels: no stored wear -> dash', /data-testid="detail-wear">—</.test(w));
  check('bottom tiles show real wear and dashes', /data-tile-wear="tires">18 %</.test(h) && /data-tile-wear="drivetrain">70 %</.test(h) && /data-tile-wear="frame">—</.test(h) && /data-tile-wear="wheels">—</.test(h));
}
{
  check('no invented values: no kg, no euro amount', !/\d+(,\d)? kg/.test(render()) && !/\d\s?€/.test(render()));
  check('stat weight/km shown when provided', render({ weightKg: 8.4, kilometres: 120 }).includes('8.4 kg'));
}
{
  const lv = (frame: number) => comps.map((c) => (c.id === 'frame' ? { ...c, level: frame } : c));
  const vis = (h: string) => /data-visual="(\w+)"/.exec(h)?.[1];
  check('frame LVL1 -> steel picture, file linked', vis(render()) === 'steel' && render().includes('/images/bikes/steel-lvl1.webp'));
  check('league does not change the picture (Elite league, frame 1 -> steel)', vis(render({ league: 'elite' })) === 'steel');
  check('frame 2/4/6/8 -> rookie/amateur/continental/pro', [2, 4, 6, 8].map((n) => vis(render({ components: lv(n) }))).join() === 'rookie,amateur,continental,pro');
  const e = render({ components: lv(10) });
  check('frame 10 -> elite uses the existing Pro file (no missing link)', vis(e) === 'elite' && e.includes('/images/bikes/pro-lvl8.webp') && !e.includes('elite-lvl10'));
  // picking a level in the upgrade panel is client state only; the SSR with a different initial pick never changes the picture
  check('other components keep their own level with a different frame', render({ components: lv(6) }).includes('data-tile="brakes"') && /data-tile-wear="brakes">45 %</.test(render({ components: lv(6) })));
  check('dev preview badge only when requested', !render().includes('data-testid="dev-preview"') && render({ devPreview: true }).includes('data-testid="dev-preview"'));
  check('image is a separate asset (no inline bike paths)', !render().includes('M355 292'));
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
