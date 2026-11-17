/**
 * Training planning rules — app side (the database is authoritative and is
 * tested in supabase/tests/training_security.test.sh, section 12).
 * Run with: npx tsx src/lib/training/planning.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { getCurrentSeasonInfo } from '@/lib/calendar/season';
import { plannableWeek } from './planning';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
}
const at = (iso: string) => plannableWeek(getCurrentSeasonInfo(new Date(iso)));

check('week 1 (preparatory) plans week 2', at('2026-10-26T00:00:00Z') === 2 && at('2026-11-01T23:59:59Z') === 2);
check('Sunday 23:59:59 UTC is still week 3 -> plans 4', at('2026-11-15T23:59:59Z') === 4);
check('Monday 00:00:00 UTC is week 4 -> plans 5', at('2026-11-16T00:00:00Z') === 5);
check('week 9 plans week 10', at('2026-12-22T12:00:00Z') === 10);
check('week 10 plans nothing (no week 1 of the next season)', at('2026-12-30T12:00:00Z') === null && at('2027-01-03T23:59:59Z') === null);
check('first Monday of the next season plans week 2 again', at('2027-01-04T00:00:00Z') === 2);
let never1 = true;
for (let d = new Date('2026-08-17T00:00:00Z'); d < new Date('2028-01-01T00:00:00Z'); d = new Date(d.getTime() + 86_400_000)) {
  const w = plannableWeek(getCurrentSeasonInfo(d));
  if (w === 1) never1 = false;
}
check('week 1 is never plannable on any day', never1);

const SRC = path.join(__dirname, '../..');
const read = (r: string) => fs.readFileSync(path.join(SRC, r), 'utf8');
const form = read('components/training/TrainingConfigForm.tsx');
const page = read('app/rider/training/page.tsx');
const reg = read('lib/races/registration.ts');
const repo = read('lib/training/repository.ts');
check('confirmed plan view has no edit / cancel / delete control', !/(edit|cancel|delete|zrušiť|upraviť)/i.test(form.slice(form.indexOf('if (plan) {'), form.indexOf('const currentOptions'))));
check('confirmed plan shows the "locked" note', /labels\.lockedNote/.test(form));
check('form never sends season or week to the server action', /saveAction\(\{ weekType, focus, intensity \}\)/.test(form) && !/seasonId/.test(form));
check('last week and Tour week show an explanation instead of the form', /blocked === 'season-end' \? labels\.blockedSeasonEnd : labels\.blockedTour/.test(form));
check('page computes the plannable week with the shared helper and the Tour conflict', /getPlannableWeek\(season\)/.test(page) && /getScheduleForTour\(r\.tourId, cal\.version\)\?\.weekNumber === plannable/.test(page));
check('page shows season + week of the planned training', /seasonNumber/.test(page) && /planCardTitle/.test(page));
check('Tour registration refuses a Tour week with a plan (friendly pre-check + DB trigger reason)', /training-conflict/.test(reg) && /training_conflict/.test(reg));
check('repository maps the new database reasons', /already_planned/.test(repo) && /tour_conflict/.test(repo) && /no_plannable_week/.test(repo));
check('growth formula and threshold untouched in config', /export const TRAINING_GAIN_THRESHOLD = 12;/.test(read('lib/training/config.ts')) && /export const BASE_TRAINING = 3;/.test(read('lib/training/config.ts')));

const keys = ['trainingPage.lockedNote', 'trainingPage.alreadyPlanned', 'trainingPage.deadlineNote', 'trainingPage.blockedSeasonEnd', 'trainingPage.blockedTour', 'races.trainingConflict'];
for (const loc of ['sk', 'en', 'cs', 'de', 'es', 'fr', 'pl']) {
  const m = JSON.parse(read(`i18n/messages/${loc}.json`)) as Record<string, string>;
  check(`${loc}: all new texts exist and are non-empty`, keys.every((k) => typeof m[k] === 'string' && m[k].length > 10));
}
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
