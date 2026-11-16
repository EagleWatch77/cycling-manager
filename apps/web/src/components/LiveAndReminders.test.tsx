/**
 * Live race window (empty, no fake data/button) and the preserved short-term reminder rules.
 * Run: npx tsx --tsconfig tsconfig.json src/components/LiveAndReminders.test.tsx
 */
import './BikeCard.setup';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiveRaceCard } from './LiveRaceCard';
import { CountdownTiles } from './dashboard/CountdownTiles';
import { shortTermReminders } from '@/lib/dashboard/shortTermReminders';
import sk from '@/i18n/messages/sk.json';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n, d); } };
const t = ((k: string) => (sk as Record<string, string>)[k] ?? k) as never;

const live = renderToStaticMarkup(<LiveRaceCard t={t} />);
check('live window: title + dash only', live.includes('Preteky naživo') && live.includes('data-empty="true"') && live.includes('>—<'));
check('live window: no fake data, no Sledovať button, no link', !/Sledovať|<button|<a |km|Etapa/i.test(live));

const labels = { days: 'dní', hours: 'hodín', minutes: 'minút', seconds: 'sekúnd' };
const cd = renderToStaticMarkup(<CountdownTiles initialMs={(2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000} labels={labels} />);
check('countdown tiles split days/hours/min/sec', ['>2<', '>03<', '>04<', '>05<'].every((x) => cd.includes(x)));
check('countdown null = dashes', (renderToStaticMarkup(<CountdownTiles initialMs={null} labels={labels} />).match(/>—</g) ?? []).length === 4);

// Preserved reminder rules (same conditions as the former Home "Manažérske úlohy").
const base = { hasRider: true, hasTrainingPlan: false, plannableWeek: 4, selectedTourCount: 1, maxSlots: 3, hasOpenUnselectedTour: true };
check('no plan -> training reminder for the plannable week', shortTermReminders(base).some((r) => r.id === 'training' && r.params.n === 4 && r.href === '/rider/training'));
check('free slot + open Tour -> pick-Tour reminder', shortTermReminders(base).some((r) => r.id === 'tours' && r.params.n === 1 && r.params.max === 3 && r.href === '/races'));
check('plan exists -> no training reminder', !shortTermReminders({ ...base, hasTrainingPlan: true }).some((r) => r.id === 'training'));
check('slots full -> no pick-Tour reminder', !shortTermReminders({ ...base, selectedTourCount: 3 }).some((r) => r.id === 'tours'));
check('no open Tour -> no pick-Tour reminder', !shortTermReminders({ ...base, hasOpenUnselectedTour: false }).some((r) => r.id === 'tours'));
check('no rider -> no reminders at all', shortTermReminders({ ...base, hasRider: false }).length === 0);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
