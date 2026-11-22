/**
 * Home "Môj bicykel": picture by frame level, overall level, component STATE
 * (100 = new) with colour bands, links, no old tiles/buttons.
 * Run: npx tsx --tsconfig tsconfig.json src/components/BikeCard.test.tsx
 */
import './BikeCard.setup';
import { renderToStaticMarkup } from 'react-dom/server';
import { BikeCard } from './BikeCard';
import { NEW_BIKE_ROWS, PREVIEW_BEFORE_TOUR, PREVIEW_AFTER_TOUR } from './BikeCard.fixtures';
import sk from '@/i18n/messages/sk.json';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n, d); } };
const t = ((k: string, v?: Record<string, string | number>) => ((sk as Record<string, string>)[k] ?? k).replace(/\{(\w+)\}/g, (_: string, n: string) => String(v?.[n] ?? ''))) as never;
const html = (items: Parameters<typeof BikeCard>[0]['items']) => renderToStaticMarkup(<BikeCard t={t} items={items} />);
const band = (h: string, id: string) => new RegExp(`data-component="${id}" data-state-band="(\\w+)"`).exec(h)?.[1];
const stateOf = (h: string, id: string) => new RegExp(`data-state="${id}">([^<]*)<`).exec(h)?.[1];

{
  const h = html(PREVIEW_BEFORE_TOUR);
  check('before first Tour: five 100 %, all green', ['frame', 'wheels', 'tires', 'brakes', 'drivetrain'].every((id) => stateOf(h, id) === '100 %' && band(h, id) === 'good'));
  check('level badge "Úroveň bicykla: 1"', h.includes('Úroveň bicykla: 1<'));
  check('level badge centred at the top, not at the saddle', /data-testid="bike-level"[^>]*left:50%/.test(h) && /top:1\.7857/.test(h));
  check('no warning when everything is good', !h.includes('data-testid="bike-warning"'));
  check('steel picture for frame LVL 1', h.includes('data-visual="steel"') && h.includes('/images/bikes/steel-lvl1.webp'));
}
{
  const h = html(PREVIEW_AFTER_TOUR);
  check('after Tour: 70 / 40 / 10 / 10 / 40', [['frame', '70 %'], ['wheels', '40 %'], ['tires', '10 %'], ['brakes', '10 %'], ['drivetrain', '40 %']].every(([id, v]) => stateOf(h, id) === v));
  check('colours: 70 green, 40 orange, 10 red', band(h, 'frame') === 'good' && band(h, 'wheels') === 'low' && band(h, 'drivetrain') === 'low' && band(h, 'tires') === 'critical' && band(h, 'brakes') === 'critical');
  check('overall level stays 1 (wear does not lower it)', h.includes('Úroveň bicykla: 1<'));
  check('critical warning names tires and brakes only', /data-testid="bike-warning"[^>]*>[^<]*Plášte, Brzdy/.test(h) && !/bike-warning"[^>]*>[^<]*Pohon/.test(h));
}
{
  const h = html(NEW_BIKE_ROWS);
  check('missing frame/wheels (migration not run): dash, never an invented 100 %', stateOf(h, 'frame') === '—' && stateOf(h, 'wheels') === '—' && band(h, 'frame') === 'unknown');
  check('real stored components shown as state 100 %', stateOf(h, 'tires') === '100 %' && stateOf(h, 'drivetrain') === '100 %');
  check('dash has an explanation title', h.includes('title="Údaj sa zatiaľ neeviduje"'));
}
{
  const lv = (levels: number[]) => PREVIEW_BEFORE_TOUR.map((r, i) => ({ ...r, level: levels[i] }));
  check('levels 2,2,1,1,1 -> 1,4', html(lv([2, 2, 1, 1, 1])).includes('Úroveň bicykla: 1,4<'));
  check('all level 4 -> 4', html(lv([4, 4, 4, 4, 4])).includes('Úroveň bicykla: 4<'));
  check('picture follows the FRAME level only', html(lv([6, 1, 1, 1, 1])).includes('data-visual="continental"') && html(lv([1, 8, 8, 8, 8])).includes('data-visual="steel"'));
  check('frame 9 -> elite picture', html(lv([9, 1, 1, 1, 1])).includes('/images/bikes/elite-lvl10.webp'));
}
{
  const h = html(PREVIEW_BEFORE_TOUR);
  check('clickable: picture -> /bike, each component -> /bike?component=<id>', h.includes('data-testid="bike-picture-link"') && ['frame', 'wheels', 'tires', 'brakes', 'drivetrain'].every((id) => h.includes(`href="/bike?component=${id}"`)) && h.includes('href="/bike"'));
  check('left: frame + drivetrain, right: brakes + wheels + tires (five leader lines)', ['frame', 'wheels', 'tires', 'brakes', 'drivetrain'].every((id) => h.includes(`data-line="${id}"`)));
  check('old tiles, wear bars and bottom link removed', !h.includes('Detail bicykla a servis') && !h.includes('Opotrebovanie') && !h.includes('<ul') && !/<button/.test(h));
  const e = html(null);
  check('no rider: empty state, no numbers', !e.includes(' %') && e.includes(sk['equipment.bikeEmpty']));
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
