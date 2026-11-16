import '../BikeCard.setup';
import { renderToStaticMarkup } from 'react-dom/server';
import { getDictionary } from '@/i18n/config';
import { LeagueTable } from './LeagueTable';
import { StandingsPanel } from '../dashboard/StandingsPanel';
import { buildTable, homeRows } from '@/lib/rankings/table';
import { previewTable, PREVIEW_RULES } from '@/lib/rankings/fixtures';

let fail = 0;
const check = (n: string, c: boolean) => { console.log(c ? '  PASS ' : '  FAIL ', n); if (!c) fail++; };
const t = getDictionary('sk');
const me = { managerId: 'me', displayName: 'Ja', countryCode: null, isMe: true, ms: null };

const one = renderToStaticMarkup(<LeagueTable table={buildTable([me], [], 'rookie')} t={t} />);
check('rookie: 3 tours, no extra stats', (one.match(/TOUR|Tour \d/gi) ?? []).length === 3 && !/Rozdiel|OVR/.test(one));
check('dashes before any result, total 0, position dash', one.includes('>—<') && one.includes('>0<') && !one.includes('data-zone'));
check('missing country: neutral marker, no flag', one.includes('Krajina nie je nastavená'));
const el = renderToStaticMarkup(<LeagueTable table={previewTable('elite', 5, 3)} t={t} />);
check('elite: 5 stage columns per tour', (el.match(/>E5</g) ?? []).length === 3);
const am = previewTable('amateur', 50, 6, PREVIEW_RULES);
const html = renderToStaticMarkup(<LeagueTable table={am} t={t} />);
check('amateur: promotion and relegation rows', html.includes('data-zone="promotion"') && html.includes('data-zone="relegation"'));
const ro = renderToStaticMarkup(<LeagueTable table={previewTable('rookie', 50, 6, PREVIEW_RULES)} t={t} />);
check('rookie: never a relegation zone', !ro.includes('data-zone="relegation"'));
const panel = renderToStaticMarkup(<StandingsPanel t={t} title="X" rows={homeRows(previewTable('rookie', 50, 5))} hasStandings href="/rankings?league=rookie&sub=1" />);
check('home: top 5 + own row, link', (panel.match(/<li /g) ?? []).length === 6 && panel.includes('data-extra') && panel.includes('href="/rankings?league=rookie&amp;sub=1"') && !panel.includes('Tour'));
console.log(fail ? 'FAILED' : 'ok'); process.exit(fail ? 1 : 0);
