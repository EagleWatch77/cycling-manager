import { buildActiveWeek } from './activeWeek';
let ok = 0, bad = 0;
const check = (n: string, c: boolean) => { c ? ok++ : (bad++, console.log('  FAIL', n)); };
const mon = new Date('2026-08-17T00:00:00Z');                      // week 1 (a training week) of season 1
const at = (iso: string) => new Date(iso);
const base = { weekNumber: 1, weekStart: mon, hasLegacyPlan: false };

const full = (now: string) => buildActiveWeek({ ...base, now: at(now), plan: { planId: 0, mode: 'full' } });
const f0 = full('2026-08-17T19:00:00Z');                          // right after the Monday 18:00 deadline: plan locked, nothing trained yet
check('after the deadline the confirmed plan and mode are still shown', f0.kind === 'plan' && f0.planId === 0 && f0.mode === 'full');
check('Full has Tue/Thu/Sat (days 1,3,5) at 12:00 UTC', f0.kind === 'plan' && f0.sessions.map((s) => s.day).join() === '1,3,5' && f0.sessions.every((s) => s.at.getUTCHours() === 12));
check('Monday evening: nothing done, the Tuesday session is next', f0.kind === 'plan' && f0.done === 0 && f0.sessions[0].status === 'next' && f0.sessions[1].status === 'planned');
const f1 = full('2026-08-18T12:00:00Z');
check('exactly at Tuesday 12:00 UTC the session counts as done, Thursday is next', f1.kind === 'plan' && f1.done === 1 && f1.sessions[1].status === 'next');
const f2 = full('2026-08-22T13:00:00Z');
check('Saturday after 12:00: 3 of 3 done, no "next"', f2.kind === 'plan' && f2.done === 3 && !f2.sessions.some((s) => s.status === 'next'));
check('the week is evaluated Monday 00:00 UTC', f2.kind === 'plan' && f2.evaluationAt.toISOString() === '2026-08-24T00:00:00.000Z');
const b = buildActiveWeek({ ...base, now: at('2026-08-19T08:00:00Z'), plan: { planId: 2, mode: 'basic' } });
check('Basic has Tue/Fri (days 1,4); 1 of 2 done on Wednesday', b.kind === 'plan' && b.sessions.map((s) => s.day).join() === '1,4' && b.done === 1 && b.total === 2);
check('no plan chosen in a training week -> a clear "no-plan" state (never silently empty)', buildActiveWeek({ ...base, now: at('2026-08-19T08:00:00Z'), plan: null }).kind === 'no-plan');
check('an old single-focus plan of that week is reported as legacy, not as "no plan"', buildActiveWeek({ ...base, now: at('2026-08-19T08:00:00Z'), plan: null, hasLegacyPlan: true }).kind === 'legacy-plan');
check('race week (even) -> no regular training, whatever plan rows exist', buildActiveWeek({ ...base, weekNumber: 2, weekStart: new Date('2026-08-24T00:00:00Z'), now: at('2026-08-25T08:00:00Z'), plan: { planId: 1, mode: 'full' } }).kind === 'race-week');
console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
