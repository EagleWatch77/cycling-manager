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
- Cards: `RiderSummaryCard`, `StandingsCard`, `SeasonCalendarCard`, `RaceStatusCard`, `RaceAnalysisCard`, `TourPreviewCard`, `EquipmentCard`, `SmallCards`
- Folders: `admin/`, `facilities/`, `market/`, `public/`, `races/`, `rankings/`, `rider/`, `training/`
- Before reuse, read the single component you need; do not bulk-read the folder.

## Rider profile header + portrait (CONFIRMED 2026-11-15)
- `RiderProfileHeader`: portrait (`RiderPortrait`, 3:4, `bg-surface`, silhouette placeholder, `onError` fallback; only displays an image, never generates/assigns) · name · nationality · age · style · league label · Celkové hodnotenie tile (`bg-teal-rail`); condition meters right (2x2 / 4 cols on mobile, inline on desktop).
- `AttributeGroup` optional props `descriptionKey` (small secondary text under the heading) and `average` (heading `Výkon · 128`).

## Attribute icons (CONFIRMED 2026-11-15)
- Single source: `lib/rider/statIcons.ts` (`getSkillStatIcon`, `getConditionStatIcon`, `getDevStatIcon`) → PNGs in `apps/web/public/ride-icon/`. Rendered only through `RiderStatIcon` (fixed square box, `object-contain`, never recoloured/wrapped).
- All 19 skill attributes now have their own icon. Výkon + Rozvoj + condition icons: original 1254 px assets (unchanged). Taktika + Technika icons: 128×128 RGBA, transparent, symbol ≤112 px: `pozicia, nacasovanie-utoku, reakcia, manazment-energie, unik` (Taktika); `zjazd, ovladanie-bicykla, zatacky, jazda-v-baliku, jazda-v-dazdi, nerovny-povrch` (Technika). `skusenosti.png` (medal) was already present and is kept.
- Sizes: detail attribute rows 24 px (Rider page and Training page alike), Silné stránky 30 px. Fixed box → no layout shift. The neutral placeholder dot stays only as a fallback for a future attribute without an asset.
- New icon sets: transparent PNG, keep the soft-gradient look, ≥8 px (of 128) padding, similar optical size; add the file + one line in `SKILL_ICON`, never reuse another attribute's icon.

## StrengthsCard (rider/StrengthsCard, CONFIRMED 2026-11-15)
- `Card dense`, title "Silné stránky jazdca"; 3 rows: stat icon (`RiderStatIcon`, neutral dot when no asset), name + small `text-xs text-navy-soft` description, value right-aligned (`text-lg font-bold`), `border-line` dividers. Below: `bg-teal-rail` box "Pretekársky profil" (style name `text-teal-dark` + description). No bars/charts/images. Sits right of the radar on desktop (`lg:col-span-5`), under it on mobile.

## Ability radar (rider/AbilityRadar, CONFIRMED 2026-11-14)
- Client SVG component, props = pre-translated model (`lib/rider/radar.ts`) + labels; never receives hidden true values.
- Known abilities: teal (`#0e9384`, filled points). Rozvoj: muted orange (`#d0944f`, text `#9a5b1c`), hollow point, dashed lines, short segment = estimated range, label "odhad"; unknown = no point, "Neznámy".
- Overview = 5 points. Selecting a group (tab pills or tapping a label) rotates it to the top and fans its attributes as small points with thin leader lines to two label columns (no overlap by fixed row spacing). Works by tap/keyboard; respects `prefers-reduced-motion`.
- `initialSelected` prop exists for tests/static rendering only.
- Layout: radar card left (lg:col-span-7, plot vertically centred; the card stretches to the right column's height), right column (lg:col-span-5) = `StrengthsCard` + `DevelopmentCard`; below the attribute group cards.
- Background (2026-11-15): the WHOLE radar card (title, tabs, plot) carries one `radial-gradient` (teal 13% centre → 2% edge) and one decorative contour SVG (`preserveAspectRatio=slice`, deterministic wobbly rings, teal stroke 7–13% opacity); card keeps `rounded-card`. `AbilityRadar` renders the card shell itself (takes `title`, `className`). Graph radius R=102 (≈13% smaller than before), label fonts unchanged. The plot SVG's viewBox interpolates between a tight overview box and a wider expanded box with the SAME aspect ratio (card height never jumps). Grid lines `#6b8195` at 30% opacity so they stay above the contours.

## Known deviations (CONFIRMED, not fixed)
- Hex colors inside SVG components (`ElevationProfile`, `AbilityRadar`, `StageProfile`, `StageScoring`); they match tokens.
- `#16a34a` (green) in `StageScoring` is not a token.
- Temporary/test UI: `app/avatar-test-temp`, `components/rider/RiderAvatarTest.tsx`, `app/admin/test-peloton`.

## PROPOSALS (not applied, need approval)
- P-D1: add a semantic `success` token matching the current green.
- P-D2: let SVG components use `currentColor` / CSS variables instead of hex.
- P-D3: document a table density convention (row height, `text-2xs` usage) after reviewing real pages.
