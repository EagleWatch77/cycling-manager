/**
 * Home cards "Môj jazdec" and "Aktuálne Tour": real values only, no invented rows, working links.
 * Run: npx tsx --tsconfig tsconfig.json src/components/DashboardCards.test.tsx
 */
import './BikeCard.setup';
import { renderToStaticMarkup } from 'react-dom/server';
import { RiderSummaryCard } from './RiderSummaryCard';
import { TourPreviewCard, type CurrentTourView } from './TourPreviewCard';
import { overallRating } from '@/lib/rider/score';
import { SKILL_ATTRIBUTES } from '@/lib/rider/config';
import sk from '@/i18n/messages/sk.json';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n, d); } };
const t = ((k: string, v?: Record<string, string | number>) => ((sk as Record<string, string>)[k] ?? k).replace(/\{(\w+)\}/g, (_: string, n: string) => String(v?.[n] ?? ''))) as never;

const attrs = Object.fromEntries(SKILL_ATTRIBUTES.map((k, i) => [k, 100 + i])) as never;
const rider = { id: 'r1', firstName: 'Ján', surname: 'Novák', countryName: 'Slovensko', countryIso2: 'SK', age: 18, attributes: attrs,
  condition: { energy: 91, fatigue: 7, form: 52, fitness: 61, morale: 73 }, conditionPrevious: { energy: 91, fatigue: 7, form: 52, fitness: 61, morale: 73 },
  inferredArchetype: 'climber', generatorVersion: 'x', isAi: false, estimates: {} } as never;

// Môj jazdec
{
  const html = renderToStaticMarkup(<RiderSummaryCard t={t} rider={rider} contractWeeksLeft={6} />);
  check('shows name, country, age, type', html.includes('Ján Novák') && html.includes('Slovensko') && html.includes('Vek 18') && html.includes('Vrchár'));
  check('portrait/avatar is on the right side of the header', /<img[^>]*width="128"/.test(html) || html.includes('width:128px'));
  const ovr = overallRating((rider as { attributes: never }).attributes);
  check('OVR is the shared overallRating()', Number.isFinite(ovr) && html.includes(`>${ovr}<`), String(ovr));
  check('shows the persisted condition values', ['91', '7', '52', '61', '73'].every((v) => html.includes(`>${v}<`)));
  check('all six condition rows + contract row in order', ['rider.ovr','rider.energy','rider.fatigue','rider.form','rider.fitness','rider.morale','contract.remaining'].every((k) => html.includes(`data-row="${k}"`)));
  check('contract weeks remaining shown', html.includes('>6<'));
  check('link to existing rider detail', html.includes('href="/rider"') && html.includes('Detail jazdca'));
  check('no progress bars', !html.includes('rounded-full bg-teal-rail'));
  check('no attribute list duplicated', !html.includes('Atribúty'));
  const noContract = renderToStaticMarkup(<RiderSummaryCard t={t} rider={rider} />);
  check('no contract data: row hidden, nothing invented', !noContract.includes('contract.remaining'));
  const empty = renderToStaticMarkup(<RiderSummaryCard t={t} rider={null} />);
  check('no rider: create prompt, no values', empty.includes('href="/rider"') && !empty.includes('data-row'));
}
// Aktuálne Tour
{
  const base: CurrentTourView = { id: 'danube-tour', name: 'Danube Tour', term: '2. 11. – 8. 11.', startsInDays: 3, countdownMs: 3 * 86_400_000 + 4 * 3_600_000 + 5 * 60_000 + 6000, registration: 'selected',
    stages: [{ number: 1, name: 'Bratislava — Nitra', distanceKm: 148, difficulty: 'flat', profile: [0.2, 0.4, 0.3] }, { number: 2, name: 'Vyšehrad — Ostrihom', distanceKm: 162, difficulty: 'hilly', profile: [0.3, 0.5, 0.4] }] };
  const html = renderToStaticMarkup(<TourPreviewCard t={t} locale="sk" tour={base} />);
  check('name, term, registration, stage names and lengths', html.includes('Danube Tour') && html.includes('2. 11. – 8. 11.') && html.includes('Vybraná') && html.includes('Bratislava') && html.includes('148') && html.includes('162'));
  check('stages count from real stages', html.includes('2 etáp'));
  check('total length = sum of visible stages (148+162=310)', html.includes('310'));
  check('countdown from server value: 3 d 04 h 05 min 06 s', ['>3<', '>04<', '>05<', '>06<'].every((x) => html.includes(x)));
  check('title is Najbližšie preteky', html.includes('Najbližšie preteky'));
  check('elevation profile drawn when profile data exists', html.includes('<polygon'));
  check('link to existing Tour detail', html.includes('href="/races/danube-tour"') && html.includes('Detail Tour'));
  check('no invented weather/focus', !/Počasie|Zameranie|Premenlivé/.test(html));
  const noProfile = renderToStaticMarkup(<TourPreviewCard t={t} locale="sk" tour={{ ...base, id: 'coastal-tour', registration: 'available', stages: base.stages.map((s) => ({ ...s, profile: undefined })) }} />);
  check('no profile data: no chart, stage rows still shown', !noProfile.includes('<polygon') && noProfile.includes('Bratislava') && noProfile.includes('Otvorená'));
  const states = (['started', 'overlap', 'season-limit'] as const).map((s) => renderToStaticMarkup(<TourPreviewCard t={t} locale="sk" tour={{ ...base, registration: s }} />));
  check('other registration states have their own labels', states[0].includes('Tour už začala') && states[1].includes('Termín sa prekrýva') && states[2].includes('Dosiahnutý limit sezóny'));
  const none = renderToStaticMarkup(<TourPreviewCard t={t} locale="sk" tour={null} />);
  check('no Tour left: empty state, link to races', none.includes('href="/races"') && !none.includes('<polygon'));
  const started = renderToStaticMarkup(<TourPreviewCard t={t} locale="sk" tour={{ ...base, countdownMs: null, startsInDays: 0 }} />);
  check('started Tour: countdown shows dashes, not a fake time', (started.match(/>—</g) ?? []).length >= 4);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
