/**
 * Tour catalogue for the Races screen.
 *
 * This is the single place your real Tours go: content only — image, name,
 * stage list, difficulty, prestige. When a Tour runs (season/week,
 * registration) lives separately in data/tourSchedule.ts, so the same Tour
 * content can be reused across seasons without duplicating it.
 *
 * `masterStages` is the full stage list; the screen shows only the stages a
 * league can see via visibleStages(), so a Rookie never sees stage 4+.
 */
import type { LeagueId } from '@/lib/leagues';

export type Difficulty = 'flat' | 'hilly' | 'mountain' | 'classics' | 'mixed';
export type Jersey = 'gc' | 'points' | 'mountain' | 'youth';

export interface TourStage {
  number: number;
  name: string;
  distanceKm: number;
  difficulty: Exclude<Difficulty, 'mixed'>;
}

export interface Tour {
  id: string;
  name: string;
  /**
   * Clean scenic cover for the Races grid card — no baked-in title/text/UI.
   * Empty string → gradient placeholder. Rendered with object-fit: cover at
   * a fixed aspect ratio, never stretched.
   */
  cardImage: string;
  /** Larger promotional artwork (may include title/branding) for the Tour detail hero. */
  heroImage: string;
  difficulty: Difficulty;
  /** 1–5 dots. */
  prestige: number;
  /** Archetype ids that suit this Tour, e.g. ["puncheur","climber"]. */
  suitableFor: string[];
  jerseys: Jersey[];
  masterStages: TourStage[];
  /** Total distance shown on the card; if omitted, summed from visible stages. */
  totalKm?: number;
  /** Leagues that may enter. Rookie by default. */
  availableIn?: LeagueId[];
}

/**
 * The five Rookie-season Tour choices. Images live under /public/tours/.
 */
export const TOURS: Tour[] = [
  {
    id: 'danube-tour',
    name: 'Danube Tour',
    cardImage: '/tours/Danube-tour-card.png',
    heroImage: '/tours/Danube-tour.png',
    difficulty: 'hilly',
    prestige: 3,
    suitableFor: ['puncheur', 'rouleur'],
    jerseys: ['gc', 'points', 'mountain', 'youth'],
    totalKm: 771,
    masterStages: [
      { number: 1, name: 'Bratislava — Nitra', distanceKm: 148, difficulty: 'flat' },
      { number: 2, name: 'Vyšehrad — Ostrihom', distanceKm: 162, difficulty: 'hilly' },
      { number: 3, name: 'Komárno — Štúrovo', distanceKm: 134, difficulty: 'flat' },
      { number: 4, name: 'Banská — Donovaly', distanceKm: 171, difficulty: 'mountain' },
      { number: 5, name: 'Poprad — Štrbské Pleso', distanceKm: 156, difficulty: 'mountain' },
    ],
  },
  {
    id: 'coastal-tour',
    name: 'Coastal Tour',
    cardImage: '/tours/Coastal-tour-card.png',
    heroImage: '/tours/Coastal-tour.png',
    difficulty: 'flat',
    prestige: 2,
    suitableFor: ['sprinter', 'rouleur'],
    jerseys: ['gc', 'points', 'mountain', 'youth'],
    totalKm: 342,
    masterStages: [
      { number: 1, name: 'Prológ pri mori', distanceKm: 14, difficulty: 'flat' },
      { number: 2, name: 'Pobrežná rovinka', distanceKm: 172, difficulty: 'flat' },
      { number: 3, name: 'Zátoková etapa', distanceKm: 156, difficulty: 'flat' },
      { number: 4, name: 'Veterná pláň', distanceKm: 168, difficulty: 'hilly' },
      { number: 5, name: 'Finiš na promenáde', distanceKm: 148, difficulty: 'flat' },
    ],
  },
  {
    id: 'highlands-tour',
    name: 'Highlands Tour',
    cardImage: '/tours/Highlands-tour-card.png',
    heroImage: '/tours/Highlands-tour.png',
    difficulty: 'mountain',
    prestige: 4,
    suitableFor: ['climber', 'puncheur'],
    jerseys: ['gc', 'points', 'mountain', 'youth'],
    totalKm: 412,
    masterStages: [
      { number: 1, name: 'Úvodná', distanceKm: 140, difficulty: 'flat' },
      { number: 2, name: 'Prvé kopce', distanceKm: 158, difficulty: 'hilly' },
      { number: 3, name: 'Kráľovská etapa', distanceKm: 175, difficulty: 'mountain' },
      { number: 4, name: 'Vysokohorská', distanceKm: 168, difficulty: 'mountain' },
      { number: 5, name: 'Časovka do vrchu', distanceKm: 38, difficulty: 'mountain' },
    ],
  },
  {
    id: 'northern-crown-tour',
    name: 'Northern Crown Tour',
    cardImage: '/tours/Northern-crown-tour-card.png',
    heroImage: '/tours/Northerd-crown-tour.png',
    difficulty: 'classics',
    prestige: 3,
    suitableFor: ['classics', 'rouleur'],
    jerseys: ['gc', 'points', 'mountain', 'youth'],
    totalKm: 386,
    masterStages: [
      { number: 1, name: 'Severná brána', distanceKm: 168, difficulty: 'flat' },
      { number: 2, name: 'Kamenné cesty', distanceKm: 174, difficulty: 'hilly' },
      { number: 3, name: 'Koruna severu', distanceKm: 44, difficulty: 'flat' },
    ],
  },
  {
    id: 'silver-horizon-tour',
    name: 'Silver Horizon Tour',
    cardImage: '/tours/Silver-horizon-tour-card.png',
    heroImage: '/tours/Silver-horizont-tour.png',
    difficulty: 'mixed',
    prestige: 4,
    suitableFor: ['allrounder', 'timeTrial'],
    jerseys: ['gc', 'points', 'mountain', 'youth'],
    totalKm: 428,
    masterStages: [
      { number: 1, name: 'Strieborné jazero', distanceKm: 162, difficulty: 'flat' },
      { number: 2, name: 'Horizontová vlna', distanceKm: 176, difficulty: 'hilly' },
      { number: 3, name: 'Časovka Obzor', distanceKm: 28, difficulty: 'flat' },
    ],
  },
];
