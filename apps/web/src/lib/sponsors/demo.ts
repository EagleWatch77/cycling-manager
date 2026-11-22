/**
 * DEMONSTRATION data for the Sponzori page, shown ONLY with `?demo=1` and always labelled as such.
 * Not stored anywhere, never signed, never paid. All names are obviously fictional placeholders and, per the owner,
 * NO money is invented: every amount is null and the UI shows "Zatiaľ neurčené".
 */
import type { SponsorContract, SponsorOffer, GoalPair } from './rules';

const DAY = 86_400_000;
const at = (now: Date, days: number) => new Date(now.getTime() + days * DAY).toISOString();
const goals = (a: GoalPair[0]['type'], b: GoalPair[1]['type']): GoalPair => [{ type: a, bonusCents: null }, { type: b, bonusCents: null }];

export function demoContracts(now: Date): SponsorContract[] {
  return [
    { id: 'demo-c1', isDemo: true, companyId: 'demo-co-1', companyName: 'Demo sponsor A', kind: 'main', signedAt: at(now, -28), endsAt: at(now, 42),
      durationWeeks: 10, weeklyIncomeCents: null, goals: goals('finishTour', 'winStage') },
    { id: 'demo-c2', isDemo: true, companyId: 'demo-co-2', companyName: 'Demo sponsor B', kind: 'secondary', signedAt: at(now, -7), endsAt: at(now, 28),
      durationWeeks: 5, weeklyIncomeCents: null, goals: goals('participateTour', 'top50') },
  ];
}

export function demoOffers(now: Date): SponsorOffer[] {
  const o = (n: number, kind: SponsorOffer['kind'], weeks: number, g: GoalPair, expiresInHours: number): SponsorOffer => ({
    id: `demo-o${n}`, isDemo: true, companyId: `demo-co-${n + 2}`, companyName: `Demo sponsor ${String.fromCharCode(66 + n)}`, kind,
    durationWeeks: weeks, weeklyIncomeCents: null, goals: g, expiresAt: new Date(now.getTime() + expiresInHours * 3_600_000).toISOString(),
  });
  return [
    o(1, 'main', 10, goals('finishTour', 'top10'), 60),
    o(2, 'main', 10, goals('participateTour', 'winTour'), 28),
    o(3, 'main', 10, goals('top50', 'winStage'), 70),
    o(4, 'secondary', 5, goals('participateTour', 'winStage'), 49),
    o(5, 'secondary', 5, goals('finishTour', 'anyJersey'), 12),
    o(6, 'secondary', 5, goals('top50', 'promotion'), 71),
  ];
}
