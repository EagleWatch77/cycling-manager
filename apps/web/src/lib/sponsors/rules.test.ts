/** Run with: npx tsx src/lib/sponsors/rules.test.ts */
import {
  SPONSOR_LIMITS, MAX_OFFERS, allowedDurations, GOAL_TYPES, GOALS, goalPairProblem, hasFinancialTerms, weeksLeft, timeLeft,
  severanceCents, signBlock, slotsFull, offerRoom, sponsorWeekKey, type SponsorOffer, type GoalType,
} from './rules';
import { LEAGUES } from '../leagues';

let pass = 0, fail = 0;
const eq = (n: string, got: unknown, want: unknown) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { fail++; console.log(`FAIL ${n}: got ${g}, want ${w}`); } };

// limits (owner table)
eq('limits', LEAGUES.map((l) => `${SPONSOR_LIMITS[l].main}/${SPONSOR_LIMITS[l].secondary}`), ['1/1', '1/2', '1/2', '1/3', '2/2']);
eq('market caps', MAX_OFFERS, { main: 3, secondary: 3, total: 6 });
// durations
for (const l of ['rookie', 'amateur', 'continental', 'pro'] as const) eq(`main ${l}`, allowedDurations(l, 'main'), [10]);
eq('main elite', allowedDurations('elite', 'main'), [10, 20]);
for (const l of LEAGUES) eq(`secondary ${l}`, allowedDurations(l, 'secondary'), [5]);
// goals
eq('12 goal types', GOAL_TYPES.length, 12);
eq('elite never promotion', GOALS.promotion.leagues.includes('elite'), false);
eq('worlds: participate', GOALS.participateWorlds.leagues, ['continental', 'pro', 'elite']);
eq('worlds: top3', GOALS.top3Worlds.leagues, ['pro', 'elite']);
eq('worlds: win', GOALS.winWorlds.leagues, ['elite']);
eq('nothing evaluable on invented data', GOAL_TYPES.every((g) => !GOALS[g].evaluable), true);
eq('repeatable stage wins and Tour finish', [GOALS.winStage.repeatable, GOALS.finishTour.repeatable, GOALS.winSeason.repeatable, GOALS.promotion.repeatable], [true, true, false, false]);
const pair = (a: GoalType, b: GoalType) => [{ type: a, bonusCents: null }, { type: b, bonusCents: null }] as const;
eq('pair ok', goalPairProblem(pair('finishTour', 'winStage'), 'rookie'), null);
eq('pair same goal', goalPairProblem(pair('finishTour', 'finishTour'), 'rookie'), 'goals_must_differ');
eq('rookie cannot get Worlds goal', goalPairProblem(pair('finishTour', 'winWorlds'), 'rookie'), 'goal_not_available:winWorlds');
eq('elite cannot get promotion', goalPairProblem(pair('finishTour', 'promotion'), 'elite'), 'goal_not_available:promotion');
// time
const now = new Date('2026-11-22T10:00:00Z');
eq('weeksLeft 4', weeksLeft('2026-12-20T10:00:00Z', now, 10), 4);
eq('weeksLeft partial rounds up', weeksLeft('2026-11-30T10:00:00Z', now, 10), 2);
eq('weeksLeft over', weeksLeft('2026-11-01T10:00:00Z', now, 10), 0);
eq('weeksLeft capped by duration', weeksLeft('2027-12-20T10:00:00Z', now, 5), 5);
eq('timeLeft', timeLeft('2026-11-24T13:30:00Z', now), { days: 2, hours: 3, expired: false });
eq('timeLeft expired', timeLeft('2026-11-22T10:00:00Z', now).expired, true);
// severance — owner example
eq('severance example 1000 x 4 = 1200', severanceCents(100_000, 4), 120_000);
eq('severance 0 weeks', severanceCents(100_000, 0), 0);
eq('severance rounds half up', severanceCents(5, 1), 2); // 1.5 -> 2
// week key: Sunday 00:00 Europe/Bratislava (winter UTC+1, summer UTC+2)
eq('key: Sat 23:59 local is the previous Sunday', sponsorWeekKey(new Date('2026-11-21T22:59:00Z')), '2026-11-15');
eq('key: Sun 00:00 local starts the new period', sponsorWeekKey(new Date('2026-11-21T23:00:00Z')), '2026-11-22');
eq('key: same period later in the week', sponsorWeekKey(new Date('2026-11-25T12:00:00Z')), '2026-11-22');
eq('key: summer time Sun 00:00 local = Sat 22:00Z', sponsorWeekKey(new Date('2026-07-04T22:00:00Z')), '2026-07-05');
eq('key: summer time Sat 23:59 local', sponsorWeekKey(new Date('2026-07-04T21:59:00Z')), '2026-06-28');
eq('key: DST change week (Oct 25 2026, 01:00Z = 02:00 CET)', sponsorWeekKey(new Date('2026-10-25T01:00:00Z')), '2026-10-25');
eq('key: idempotent for same instant', sponsorWeekKey(now) === sponsorWeekKey(new Date(now)), true);
// signing guard
const offer = (o: Partial<SponsorOffer> = {}): SponsorOffer => ({
  id: 'o1', isDemo: false, companyId: 'c1', companyName: 'Test', kind: 'main', durationWeeks: 10, weeklyIncomeCents: 100, expiresAt: '2026-11-30T00:00:00Z',
  goals: [{ type: 'finishTour', bonusCents: 10 }, { type: 'winStage', bonusCents: 20 }], ...o,
});
const base = { status: 'open' as const, league: 'rookie' as const, now, activeByKind: { main: 0, secondary: 0 }, lastSignedCompanyId: null, economyEnabled: true };
eq('financial terms complete', hasFinancialTerms(offer()), true);
eq('no money -> blocked', signBlock({ ...base, offer: offer({ weeklyIncomeCents: null }) }), 'no_financial_terms');
eq('zero money -> blocked', signBlock({ ...base, offer: offer({ weeklyIncomeCents: 0 }) }), 'no_financial_terms');
eq('missing bonus -> blocked', signBlock({ ...base, offer: offer({ goals: [{ type: 'finishTour', bonusCents: null }, { type: 'winStage', bonusCents: 20 }] }) }), 'no_financial_terms');
eq('economy off -> blocked', signBlock({ ...base, offer: offer(), economyEnabled: false }), 'economy_not_enabled');
eq('valid offer can be signed', signBlock({ ...base, offer: offer() }), null);
eq('expired', signBlock({ ...base, offer: offer({ expiresAt: '2026-11-22T09:00:00Z' }) }), 'expired');
eq('rejected offer', signBlock({ ...base, offer: offer(), status: 'rejected' }), 'not_open');
eq('wrong duration', signBlock({ ...base, offer: offer({ durationWeeks: 20 }) }), 'duration_not_allowed');
eq('elite 20 weeks ok', signBlock({ ...base, league: 'elite', offer: offer({ durationWeeks: 20 }) }), null);
eq('secondary 10 weeks wrong', signBlock({ ...base, offer: offer({ kind: 'secondary', durationWeeks: 10 }) }), 'duration_not_allowed');
eq('slots full (rookie main 1)', signBlock({ ...base, offer: offer(), activeByKind: { main: 1, secondary: 0 } }), 'slots_full');
eq('elite second main ok', signBlock({ ...base, league: 'elite', offer: offer(), activeByKind: { main: 1, secondary: 0 } }), null);
eq('same sponsor twice in a row', signBlock({ ...base, offer: offer(), lastSignedCompanyId: 'c1' }), 'same_sponsor_twice');
eq('other sponsor in between -> allowed again', signBlock({ ...base, offer: offer(), lastSignedCompanyId: 'c2' }), null);
eq('full slots still SHOWN (slotsFull flag)', slotsFull('rookie', 'main', { main: 1, secondary: 0 }), true);
eq('offerRoom', offerRoom({ main: 2, secondary: 3 }), { main: 1, secondary: 0 });
eq('offerRoom never negative', offerRoom({ main: 5, secondary: 9 }), { main: 0, secondary: 0 });

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
