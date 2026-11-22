/**
 * Sponsor logos: all 80 companies map (by kind + exact name) to an existing, safe SVG; fallback is the text name.
 * Run with: npx tsx src/lib/sponsors/logos.test.tsx
 */
import '../../components/BikeCard.setup';
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { APPROVED_MAIN_SPONSORS, APPROVED_SECONDARY_SPONSORS } from './catalog';
import { SPONSOR_LOGO_SLUGS, sponsorLogoUrl, sponsorMarkUrl } from './logos';
import { SponsorName } from '@/components/sponsors/SponsorLogo';
import { OfferCard, ContractCard } from '@/components/sponsors/SponsorCards';
import { demoContracts, demoOffers } from './demo';
import { getDictionary } from '@/i18n/config';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) pass++; else { fail++; console.log(`FAIL ${n} ${d}`); } };
const root = path.resolve(__dirname, '../../../../..');
const pub = path.join(root, 'apps/web/public');
const manifest: { kind: 'main' | 'secondary'; name: string; slug: string; catalog_no: number }[] = JSON.parse(fs.readFileSync(path.join(root, 'docs/sponsors_logos_manifest.json'), 'utf8'));

check('manifest: 30 main + 50 secondary', manifest.filter((m) => m.kind === 'main').length === 30 && manifest.filter((m) => m.kind === 'secondary').length === 50);
check('manifest main names == approved main catalogue, same order', JSON.stringify(manifest.filter((m) => m.kind === 'main').map((m) => m.name)) === JSON.stringify(APPROVED_MAIN_SPONSORS));
check('manifest secondary names == approved secondary catalogue, same order', JSON.stringify(manifest.filter((m) => m.kind === 'secondary').map((m) => m.name)) === JSON.stringify(APPROVED_SECONDARY_SPONSORS));
check('mapping has exactly 80 entries', Object.keys(SPONSOR_LOGO_SLUGS).length === 80);
check('mapping == manifest (kind + exact name -> slug) for all 80', manifest.every((m) => SPONSOR_LOGO_SLUGS[`${m.kind}:${m.name}`] === m.slug));
check('slugs are unique and derived from the name', new Set(manifest.map((m) => m.slug)).size === 80 && manifest.every((m) => m.slug === m.name.toLowerCase().replace(/\s+/g, '-')));

let missing: string[] = [], unsafe: string[] = [], badSize: string[] = [];
for (const m of manifest) {
  for (const [url, size] of [[sponsorLogoUrl(m.kind, m.name), '800x200'], [sponsorMarkUrl(m.kind, m.name), '190x200']] as const) {
    if (!url) { missing.push(`${m.kind}:${m.name}`); continue; }
    const f = path.join(pub, url);
    if (!fs.existsSync(f)) { missing.push(url); continue; }
    const svg = fs.readFileSync(f, 'utf8');
    if (!svg.trimStart().startsWith('<svg') || /<script|<foreignObject|<image|href=|onload=|<style|@import|url\(http/i.test(svg)) unsafe.push(url);
    if (!svg.includes(`width="${size.split('x')[0]}" height="${size.split('x')[1]}"`)) badSize.push(url);
  }
}
check('all 80 logos + 80 symbols exist as files', missing.length === 0, missing.slice(0, 5).join(','));
check('all SVG are plain vector (no script, external link, raster, style)', unsafe.length === 0, unsafe.slice(0, 5).join(','));
check('logos 800x200, symbols 190x200 (aspect ratio known)', badSize.length === 0, badSize.slice(0, 5).join(','));
check('no stray files in public/sponsors (exactly 160 svg)', fs.readdirSync(path.join(pub, 'sponsors'), { recursive: true }).filter((f) => String(f).endsWith('.svg')).length === 160);
check('kind matters: a main name under secondary has no logo', sponsorLogoUrl('secondary', 'Veltaro Cycling') === null && sponsorLogoUrl('main', 'Velora Nutrition') === null);
check('unknown name has no logo', sponsorLogoUrl('main', 'Neexistujuca firma') === null);

const h = renderToStaticMarkup(createElement(SponsorName, { name: 'Veltaro Cycling', kind: 'main' }));
check('known: <img> with name as alt, transparent SVG, ratio kept, never overflows', h.includes('src="/sponsors/main/veltaro-cycling.svg"') && h.includes('alt="Veltaro Cycling"') && /w-auto/.test(h) && /max-w-full/.test(h) && /object-contain/.test(h));
const fb = renderToStaticMarkup(createElement(SponsorName, { name: 'Neexistujuca firma', kind: 'main' }));
check('missing logo -> plain text name, no <img>', fb.includes('Neexistujuca firma') && !fb.includes('<img'));

const t = getDictionary('sk'); const now = new Date('2026-11-22T10:00:00Z');
const offers = demoOffers(now, APPROVED_MAIN_SPONSORS, APPROVED_SECONDARY_SPONSORS);
const cards = offers.map((o) => renderToStaticMarkup(createElement(OfferCard, { o, now, locale: 'sk', t, league: 'rookie', activeByKind: { main: 0, secondary: 0 }, lastSignedCompanyId: null, economyEnabled: false })));
check('all 6 offer cards show a logo (card) + a symbol (Detail) of their own company', offers.every((o, i) => cards[i].includes(sponsorLogoUrl(o.kind, o.companyName)!) && cards[i].includes(sponsorMarkUrl(o.kind, o.companyName)!)));
check('offer card keeps both goals, Detail, Odmietnuť and the locked Prijať', cards.every((c) => c.includes('Základný cieľ') && c.includes('Náročnejší cieľ') && c.includes('>Detail<') && c.includes('Odmietnuť') && /<button[^>]*disabled[^>]*>Prijať/.test(c)));
const contracts = demoContracts(now, APPROVED_MAIN_SPONSORS, (n) => `Vedľajší sponzor (ukážka ${n})`);
const ch = contracts.map((c) => renderToStaticMarkup(createElement(ContractCard, { c, now, locale: 'sk', t })));
check('active contract with a catalogue firm shows its logo', ch[0].includes('/sponsors/main/veltaro-cycling.svg'));
check('active contract of a placeholder (demo) name falls back to text', ch[1].includes('Vedľajší sponzor (ukážka 1)') && !ch[1].includes('<img'));
check('contract keeps Detail and the DISABLED Predčasne ukončiť', ch.every((c) => c.includes('>Detail<') && /<button[^>]*disabled[^>]*>Predčasne ukončiť/.test(c)));
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
