/**
 * DEMONSTRATION data for the Sponzori page, shown ONLY with `?demo=1` and always labelled as such.
 * Not stored anywhere, never signed, never paid. All names are obviously fictional placeholders and, per the owner,
 * NO money is invented: every amount is null and the UI shows "Zatiaľ neurčené".
 */
import type { SponsorContract, SponsorOffer, GoalPair } from './rules';

const DAY = 86_400_000;
const at = (now: Date, days: number) => new Date(now.getTime() + days * DAY).toISOString();
const goals = (a: GoalPair[0]['type'], b: GoalPair[1]['type']): GoalPair => [{ type: a, bonusCents: null }, { type: b, bonusCents: null }];

/**
 * Names come from the approved MAIN catalogue (passed in from the database; the constant is only a fallback). Secondary sponsors have no
 * approved catalogue yet, so their DEMO cards use a neutral label (`secondaryLabel(n)`), never an invented company.
 */
export function demoContracts(now: Date, main: readonly string[], secondaryLabel: (n: number) => string): SponsorContract[] {
  return [
    { id: 'demo-c1', isDemo: true, companyId: 'demo-co-1', companyName: main[0], kind: 'main', signedAt: at(now, -28), endsAt: at(now, 42),
      durationWeeks: 10, weeklyIncomeCents: null, goals: goals('finishTour', 'winStage') },
    { id: 'demo-c2', isDemo: true, companyId: 'demo-co-2', companyName: secondaryLabel(1), kind: 'secondary', signedAt: at(now, -7), endsAt: at(now, 28),
      durationWeeks: 5, weeklyIncomeCents: null, goals: goals('participateTour', 'top50') },
  ];
}

export function demoOffers(now: Date, main: readonly string[], secondaryLabel: (n: number) => string): SponsorOffer[] {
  const o = (n: number, kind: SponsorOffer['kind'], weeks: number, g: GoalPair, expiresInHours: number): SponsorOffer => ({
    id: `demo-o${n}`, isDemo: true, companyId: `demo-co-${n + 2}`, companyName: kind === 'main' ? main[n + 1] : secondaryLabel(n - 2), kind,
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
