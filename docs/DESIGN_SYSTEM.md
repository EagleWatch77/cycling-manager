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

## Known deviations (CONFIRMED, not fixed)
- Hex colors inside SVG components (`ElevationProfile`, `AbilityRadar`, `StageProfile`, `StageScoring`); they match tokens.
- `#16a34a` (green) in `StageScoring` is not a token.
- Temporary/test UI: `app/avatar-test-temp`, `components/rider/RiderAvatarTest.tsx`, `app/admin/test-peloton`.

## PROPOSALS (not applied, need approval)
- P-D1: add a semantic `success` token matching the current green.
- P-D2: let SVG components use `currentColor` / CSS variables instead of hex.
- P-D3: document a table density convention (row height, `text-2xs` usage) after reviewing real pages.
