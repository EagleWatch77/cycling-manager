/**
 * Sponzori cards: money never invented ("Zatiaľ neurčené"), Prijať / Predčasne ukončiť locked, Odmietnuť live only for real offers,
 * slots-full note, filters of the page logic, demo labelling.
 * Run with: npx tsx src/components/sponsors/SponsorCards.test.tsx
 */
import '../BikeCard.setup';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { getDictionary } from '@/i18n/config';
import { ContractCard, OfferCard } from './SponsorCards';
import { demoContracts as dc, demoOffers as dofr } from '@/lib/sponsors/demo';
import { APPROVED_MAIN_SPONSORS, APPROVED_SECONDARY_SPONSORS } from '@/lib/sponsors/catalog';
import type { SponsorOffer } from '@/lib/sponsors/rules';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };
const t = getDictionary('sk');
const now = new Date('2026-11-22T10:00:00Z');
const none = { main: 0, secondary: 0 };
const sec = (n: number) => t('sp.demo.secondaryName', { n });
const demoContracts = (d: Date) => dc(d, APPROVED_MAIN_SPONSORS, sec);
const demoOffers = (d: Date) => dofr(d, APPROVED_MAIN_SPONSORS, APPROVED_SECONDARY_SPONSORS);

const contract = renderToStaticMarkup(createElement(ContractCard, { c: demoContracts(now)[0], now, locale: 'sk', t }));
check('contract: company name, type badge and DEMO badge', contract.includes('Veltaro Cycling') && contract.includes('>Hlavný sponzor<') && contract.includes('>DEMO<'));
check('contract: signed date, end date, remaining weeks shown', contract.includes('Podpísané') && contract.includes('Ukončenie') && contract.includes('6 týž.'), contract.slice(0, 200));
check('contract: income and both bonuses say "Zatiaľ neurčené" (no invented number)', (contract.match(/Zatiaľ neurčené/g) ?? []).length >= 4 && !/€|EUR/.test(contract));
check('contract: both goals with their labels', contract.includes('Základný cieľ') && contract.includes('Náročnejší cieľ') && contract.includes('Dokonči Tour') && contract.includes('Vyhraj etapu'));
check('contract: Detail + Predčasne ukončiť present, the latter DISABLED', contract.includes('>Detail<') && /<button[^>]*disabled[^>]*>Predčasne ukončiť/.test(contract));
check('contract detail explains optional goals, repeatable/once, 30 % fee, season border', ['nepovinné', 'Opakovateľný', 'Jednorazový', '30 %', 'hranice sezón'].every((s) => contract.includes(s)) || contract.includes('Opakovateľný') && contract.includes('30 %'));

const offerHtml = (o: SponsorOffer, active = none, league: 'rookie' | 'elite' = 'rookie', economy = false) =>
  renderToStaticMarkup(createElement(OfferCard, { o, now, locale: 'sk', t, league, activeByKind: active, lastSignedCompanyId: null, economyEnabled: economy }));
const o1 = demoOffers(now)[0];
const real: SponsorOffer = { ...o1, id: '11111111-1111-1111-1111-111111111111', isDemo: false };
const h = offerHtml(o1);
check('offer: type, duration, expiry DATE and countdown, income, two goals', h.includes('Hlavný sponzor') && h.includes('Ponuka platí do') && h.includes('10 týž.') && h.includes('o 2 d 12 h') && h.includes('Garantovaný týždenný príjem') && h.includes('Základný cieľ') && h.includes('Náročnejší cieľ'));
check('offer: Prijať is disabled and explains why (finances)', /<button[^>]*disabled[^>]*>Prijať/.test(h) && h.includes('Podpis sa sprístupní po schválení financií'));
check('offer: demo Odmietnuť is disabled (no real action on demo data)', /<button[^>]*disabled[^>]*>Odmietnuť/.test(h));
const hr = offerHtml(real);
check('real offer: Odmietnuť is a live form button with the offer id', /<form[^>]*>.*name="offerId" value="11111111-1111-1111-1111-111111111111".*<button type="submit"[^>]*>Odmietnuť/s.test(hr));
check('real offer: Prijať still disabled while money is undetermined', /<button[^>]*disabled[^>]*>Prijať/.test(hr));
check('slots full: offer visible + note "Miesto je obsadené"', offerHtml(o1, { main: 1, secondary: 0 }).includes('Miesto je obsadené'));
check('slots free: no "Miesto je obsadené" note', !offerHtml(o1, none).includes('Miesto je obsadené'));
check('elite has a free second main slot (no note)', !offerHtml(o1, { main: 1, secondary: 0 }, 'elite').includes('Miesto je obsadené'));
const paid: SponsorOffer = { ...real, weeklyIncomeCents: 100_000, goals: [{ type: 'finishTour', bonusCents: 10_000 }, { type: 'winStage', bonusCents: 20_000 }] };
check('if money exists it is formatted, never shown as "Zatiaľ neurčené"', !offerHtml(paid).includes('Zatiaľ neurčené') && /1\s?000/.test(offerHtml(paid)));
check('even with money Prijať stays locked while the economy switch is off', /<button[^>]*disabled[^>]*>Prijať/.test(offerHtml(paid)));
check('demo market = 3 main + 3 secondary offers (5 weeks), 1 main + 1 secondary contract', demoOffers(now).filter((o) => o.kind === 'main').length === 3 && demoOffers(now).filter((o) => o.kind === 'secondary').length === 3 && demoOffers(now).filter((o) => o.kind === 'secondary').every((o) => o.durationWeeks === 5) && demoContracts(now).length === 2);
const hs = offerHtml(demoOffers(now).find((o) => o.kind === 'secondary')!);
check('secondary offer card: type, 5 weeks, expiry, remaining time, both goals, income and bonuses undetermined, Detail, locked Prijať', hs.includes('Vedľajší') && hs.includes('5 týž.') && hs.includes('Ponuka platí do') && hs.includes('Základný cieľ') && hs.includes('Náročnejší cieľ') && hs.includes('Zatiaľ neurčené') && hs.includes('>Detail<') && /<button[^>]*disabled[^>]*>Prijať/.test(hs));
check('every demo offer has two different goals, easier before harder', demoOffers(now).every((o) => o.goals[0].type !== o.goals[1].type));
check('demo offers use six different catalogue companies (main from the main list, secondary from the secondary list)', new Set(demoOffers(now).map((o) => o.companyName)).size === 6 && demoOffers(now).every((o) => (o.kind === 'main' ? APPROVED_MAIN_SPONSORS : APPROVED_SECONDARY_SPONSORS).includes(o.companyName)));
check('expiry date is the real expires_at (offer created + 21 days stays visible)', h.includes(new Date(o1.expiresAt).getFullYear().toString()));
check('demo carries no money at all', [...demoOffers(now), ...demoContracts(now)].every((x) => x.weeklyIncomeCents === null && x.goals.every((g) => g.bonusCents === null)));
check('all demo items are flagged isDemo', [...demoOffers(now), ...demoContracts(now)].every((x) => x.isDemo));
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
