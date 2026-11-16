# DESIGN_SYSTEM — web UI

Source of truth: existing `apps/web/tailwind.config.ts`, `src/app/globals.css` and `src/components/ui/*`.
This file **documents** what exists. It introduces no new visual style. Items marked PROPOSAL are not applied.

Direction: light, modern, information-dense, consistent (GPRO-like manager game).

## Tokens (CONFIRMED, tailwind.config.ts)
| Token | Value | Use |
|---|---|---|
| `surface` | `#f5f7f8` | page background |
| `card` | `#ffffff` | card background |
| `line` | `#e4e9ec` | borders, dividers |
| `navy` / `navy-soft` / `navy-muted` | `#12283d` / `#33506a` / `#6b8195` | text: primary / secondary / muted |
| `teal` / `teal-dark` / `teal-light` / `teal-rail` | `#0e9384` / `#0b7469` / `#d6f0ec` / `#e8f4f2` | accent, hover, soft fill, rail |
| `warn` | `#d97706` | warning |
| `danger` | `#dc2626` | error / negative |
| font `sans` | Manrope (`--font-manrope`), then Inter/system | all text |
| `text-2xs` | 0.6875rem / 0.9rem | dense labels |
| `shadow-card` | subtle navy shadow | cards |
| `rounded-card` | 0.75rem | cards |

`globals.css`: `color-scheme: light`, body = `surface` + `navy`, reduced-motion respected.

## Rules
- Use tokens via Tailwind classes. No new hex colors in new code.
- Reuse `components/ui/*` before creating a component. A new shared component needs approval.
- Dense layouts: use the existing `dense` prop (Card, SectionCard) and `text-2xs`.
- Text through i18n keys (`apps/web/src/i18n`).

## Shared components (CONFIRMED, `components/ui`)
| Component | Props (key ones) | Notes |
|---|---|---|
| `Card` | `title?`, `action?`, `dense?`, `className?` | also exports `CardLink` |
| `SectionCard` | `icon?`, `title`, `action?`, `dense?` | card with icon header |
| `DataTable<T>` | `columns`, `rows`, `rowKey`, `rowHref?`, `emptyText` | column: `header`, `align`, `render` |
| `PageHeader` | `icon?`, `title`, `subtitle?`, `action?` | page top |
| `SummaryCard` | `icon?`, `label`, `value` | stat tile |
| `StatusBadge` | `label`, `tone` | tones: `teal`, `gray`, `warn`, `danger` |
| `ProgressBar` | `value`, `tone?` | tones: `teal`, `warn`, `navy` |
| `PrimaryButton` | `href?`, `variant?`, `type?`, `full?` | variants: `primary`, `secondary` |
| `EmptyState` | `icon`, `title?`, `text`, `action?` | empty lists |
| `Icon` | name | inline SVG path set; list names in `Icon.tsx` |
| `ElevationProfile` | `samples`, `height?`, `markers?`, `showEnds?` | stage profile chart |

## Domain components (names only; code NOT reviewed)
- Layout: `AppShell`, `SidebarNavigation`, `TopStatusBar`, `PageHeroBanner`, `PlaceholderPage`, `LogoutButton`
- Cards: `RiderSummaryCard`, `StandingsCard`, `SeasonCalendarCard`, `RaceStatusCard`, `RaceAnalysisCard`, `TourPreviewCard`, `BikeCard`, `SmallCards`
- Folders: `admin/`, `facilities/`, `market/`, `public/`, `races/`, `rankings/`, `rider/`, `training/`
- Before reuse, read the single component you need; do not bulk-read the folder.

## Rider profile header + portrait (CONFIRMED 2026-11-15)
- `RiderProfileHeader`: portrait (`RiderPortrait`, 3:4, `bg-surface`, silhouette placeholder, `onError` fallback; only displays an image, never generates/assigns) · name · nationality · age · style · league label · Celkové hodnotenie tile (`bg-teal-rail`); condition meters right (2x2 / 4 cols on mobile, inline on desktop).
- `AttributeGroup` optional prop `descriptionKey` (small secondary text under the heading). Headings carry NO numbers (group averages live only on the radar).

## Card headings + typography on Rider → Prehľad (CONFIRMED 2026-11-15)
- Reference = the Taktika card. Shared component `ui/CardTitle` (`icon`, children): `flex items-center gap-1.5 text-sm text-teal-dark` + `Icon h-3.5 w-3.5 text-teal`, placed in `Card`'s `title` slot (which supplies `text-2xs font-semibold uppercase tracking-wide`, `px-3.5 py-2.5`). Used by Radar schopností (`radar` icon), Silné stránky jazdca (`trend`), Rozvoj (`sprout`), Výkon (`chart`), Taktika (`bolt`), Technika (`wheel`), Skúsenosti (`trophy`). New outline icons `radar`, `trend`, `sprout` were added to `ui/Icon` (the single icon set). `SectionCard` (other pages) is unchanged.
- The radar card renders the same header without the bottom divider so it blends into the full-card background.
- Row typography: attribute name `text-[15px] text-navy`; value `text-base font-bold tabular-nums text-navy` right-aligned; secondary text `text-xs leading-snug text-navy-soft`; rows `gap-2.5 py-2 border-b border-line last:border-0`. Hierarchy stays: heading > name/value > secondary text.
- Rozvoj card = heading + five compact rows with thin dividers, no description lines: Potenciál, Trénovateľnosť, Profesionalita, Regenerácia (five stars, `DevAttributeRow variant="stars"`, unavailable = „Neznáme") and Skúsenosti (`variant="number"`, public value); explanations = `title` tooltips (C-047, C-049).

## Rider → Tréning (CONFIRMED 2026-11-15)
- Same card system as Prehľad: every card heading is `CardTitle` (teal, icon, same size/padding): Tréning pre týždeň N / M (`calendar`), Stav jazdca (`heart`), Rozvoj (`sprout`), Výkon (`chart`), Taktika (`bolt`), Technika (`wheel`).
- Layout (lg): `grid-cols-12` — left `col-span-8` = planner only (training history is not shown here, see C-041); right `col-span-4` = Stav jazdca + Rozvoj; below, `lg:grid-cols-3` = Výkon | Taktika | Technika (`AttributeGroup`, `showStatIcons statIconSize={24} showBars={false}` + `bonuses`, so the "+N" gain column stays). Mobile: one column in the same order.
- Planner controls share `CONTROL` (`rounded-lg px-3 py-2 text-sm font-semibold`): active = `bg-teal text-white`, inactive = `bg-surface text-navy-soft hover:bg-teal-rail`; field labels `text-xs font-semibold text-navy-muted`; main button stays `bg-teal`. On desktop the planner is two columns (choices | week strip + condition).
- Confirmed plan card (`border-teal/30 bg-teal-rail`): focus + small `lock` icon (top right, text only as aria-label/title, no visible explanation), week, type · intensity, NAPLÁNOVANÝ badge, WeeklyStrip. No Energia/Únava/Pripravenosť strip in the planner — condition is shown only in Stav jazdca (C-042).
- Vývoj jazdca card (`CardTitle icon="trend"`, left column under the planner): only 3 OVR boxes (`border-line bg-surface`, `text-base font-bold tabular-nums`) for Free; Premium adds the SVG line chart (`stroke-teal`, metric `<select>`, real points only). Per-attribute history lives in the existing cards: shared `HistoryToggle` (off `border-line bg-card text-navy-soft`, on `bg-teal text-white`) above Výkon/Taktika/Technika; `AttributeGroup compare` = columns `[label][64px from][48px now][52px diff]` with header; `DevAttributeRow compare` = one sub-line for Skúsenosti. Delta colours `DELTA_CLASS` (`text-green-600` / `text-navy-muted` / `text-danger`).
- Value typography everywhere: `text-base font-bold tabular-nums text-navy` (attribute groups, condition rows).

## Attribute icons (CONFIRMED 2026-11-15)
- Single source: `lib/rider/statIcons.ts` (`getSkillStatIcon`, `getConditionStatIcon`, `getDevStatIcon`) → PNGs in `apps/web/public/ride-icon/`. Rendered only through `RiderStatIcon` (fixed square box, `object-contain`, never recoloured/wrapped).
- All 19 skill attributes now have their own icon. Výkon + Rozvoj + condition icons: original 1254 px assets (unchanged). Taktika + Technika icons: 128×128 RGBA, transparent, symbol ≤112 px: `pozicia, nacasovanie-utoku, reakcia, manazment-energie, unik` (Taktika); `zjazd, ovladanie-bicykla, zatacky, jazda-v-baliku, jazda-v-dazdi, nerovny-povrch` (Technika). `skusenosti.png` (medal) was already present and is kept.
- Sizes: detail attribute rows 24 px (Rider page and Training page alike), Silné stránky 30 px. Fixed box → no layout shift. The neutral placeholder dot stays only as a fallback for a future attribute without an asset.
- New icon sets: transparent PNG, keep the soft-gradient look, ≥8 px (of 128) padding, similar optical size; add the file + one line in `SKILL_ICON`, never reuse another attribute's icon.

## StrengthsCard (rider/StrengthsCard, CONFIRMED 2026-11-15)
- `Card dense`, title "Silné stránky jazdca"; 3 rows: stat icon (`RiderStatIcon`, neutral dot when no asset), name + small `text-xs text-navy-soft` description, value right-aligned (`text-base font-bold tabular-nums`, same as attribute groups), name `text-[15px] text-navy` (normal weight), `border-line` dividers. Below: `bg-teal-rail` box "Pretekársky profil" (style name `text-teal-dark` + description). No bars/charts/images. Sits right of the radar on desktop (`lg:col-span-5`), under it on mobile.

## Ability radar (rider/AbilityRadar, CONFIRMED 2026-11-14)
- Client SVG component, props = pre-translated model (`lib/rider/radar.ts`) + labels; never receives hidden true values.
- Known abilities: teal (`#0e9384`, filled points). Rozvoj: muted orange (`#d0944f`, text `#9a5b1c`), hollow point, dashed lines, short segment = estimated range, label "odhad"; unknown = no point, "Neznámy". With the player's own 1-5 levels (C-047) the value is shown as stars and the point sits mid-bucket.
- Radar tabs (pills): Prehľad | Výkon | Taktika | Technika | Skúsenosti | Rozvoj (wrap on small screens). Skúsenosti tab works like the other tabs: the same five-axis radar rotates so the Skúsenosti axis points up; the other axes stay visible; single attribute = axis label name + value, no fan (C-048).
- Overview = 5 points. Selecting a group (tab pills or tapping a label) rotates it to the top and fans its attributes as small points with thin leader lines to two label columns (no overlap by fixed row spacing). Works by tap/keyboard; respects `prefers-reduced-motion`.
- `initialSelected` prop exists for tests/static rendering only.
- Layout: radar card left (lg:col-span-7, plot vertically centred; the card stretches to the right column's height), right column (lg:col-span-5) = `StrengthsCard` + `DevelopmentCard`; below, three equal full-width cards Výkon | Taktika | Technika (`lg:col-span-4`; Skúsenosti is now the fifth row of the Rozvoj card, C-049).
- Background (2026-11-15): the WHOLE radar card (title, tabs, plot) carries one `radial-gradient` (teal 13% centre → 2% edge) and one decorative contour SVG (`preserveAspectRatio=slice`, deterministic wobbly rings, teal stroke 7–13% opacity); card keeps `rounded-card`. `AbilityRadar` renders the card shell itself (takes `title`, `className`). Graph radius R=102 (≈13% smaller than before), label fonts unchanged. The plot SVG's viewBox interpolates between a tight overview box and a wider expanded box with the SAME aspect ratio (card height never jumps). Grid lines `#6b8195` at 30% opacity so they stay above the contours.

## Known deviations (CONFIRMED, not fixed)
- Hex colors inside SVG components (`ElevationProfile`, `AbilityRadar`, `StageProfile`, `StageScoring`); they match tokens.
- `#16a34a` (green) in `StageScoring` is not a token.
- Temporary/test UI: `app/avatar-test-temp`, `components/rider/RiderAvatarTest.tsx`, `app/admin/test-peloton`.

## PROPOSALS (not applied, need approval)
- P-D1: add a semantic `success` token matching the current green.
- P-D2: let SVG components use `currentColor` / CSS variables instead of hex.
- P-D3: document a table density convention (row height, `text-2xs` usage) after reviewing real pages.

## Rider → Kontrakt / História (2026-11-16, C-050)
- Both tabs: `grid-cols-12`, one card `col-span-12 lg:col-span-6`, shared `Card` + `CardTitle` (teal; icons `coin` / `calendar`). No decorative icons, no buttons, no explanatory paragraphs.
- Kontrakt (`ContractCard`): five compact rows with thin dividers, label `text-[15px] text-navy-soft` left, value `text-[15px] font-semibold tabular-nums` right (status "Aktívny" in teal): Stav kontraktu, Začiatok, Koniec ("Sezóna 2 · Týždeň 4"), Trvanie (týždne), Zostáva (týždne). Units live in the label so no plural forms are needed in 7 languages. No contract = one quiet `text-sm text-navy-soft` line.
- História (`CareerHistoryCard`): vertical timeline (thin `border-line` rail, small teal dot), heading "Sezóna N · Týždeň M" (`text-xs font-semibold text-teal-dark`), events of one week grouped, title `text-[15px] text-navy`, detail `text-xs text-navy-soft` ("Zakúpený do ligy Rookie 1.1", "Kontrakt na 10 týždňov"). Oldest first. Empty = one quiet line.

## Market purchase + planned swap (2026-11-16, C-052)
- "Kúpiť jazdca" on the market rider detail: existing teal button style (`bg-teal`, `rounded-lg`, `text-sm font-semibold`) under the rider header, one `text-xs text-navy-soft` note below, error `text-xs font-semibold text-danger`. Rendered only when the swap switch is on and the manager has no pending swap.
- Planned swap (market detail + Kontrakt tab): a dense `Card` titled "Plánovaná výmena" (calendar icon) with two rows in the Kontrakt row style: Nový jazdec, Prevzatie ("Sezóna 2 · Týždeň 5"). No descriptions. The current rider stays in Jazdec until the closure.
- História: new event "Koniec kontraktu" in the same timeline style.
- `BikeCard` (Home): compact table Komponent | [Úroveň, only when level data exists] | Opotrebovanie | Stav (dot + OK / Servis / Údržba in teal / warn / danger), alert strip only when something needs attention, link to /facilities. WEAR (0 % new) derived as 100 - stored condition. Unknown values render as "—". Replaces `EquipmentCard`.
- Home layout (C-056): tasks full width, then two-column rows `md:grid-cols-2` (rider | bike) and `lg:grid-cols-2` (calendar+training | Tour+standings), `items-start`; every dashboard card uses `SectionCard` (icon + teal title). `RiderSummaryCard` = avatar header + table rows (OVR, energy, fatigue, form, fitness, morale, contract weeks). `TourPreviewCard` = `CurrentTourView` (term, registration, stages, optional profile).

