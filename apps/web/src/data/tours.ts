/**
 * Tour catalogue for the Races screen.
 *
 * This is the single place your real Tours go. Add entries here — image, name,
 * schedule, stage list, difficulty, prestige — and the screen fills itself in.
 * The sample entries below are clearly marked and can be deleted once your five
 * real Tours are in.
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
  /** Path under /public, e.g. "/tours/alpine.webp". Empty string → gradient placeholder. */
  image: string;
  /** Race week this Tour opens in (season model comes later; shown as a badge). */
  week: number;
  dateRange: string;
  /** Days until it starts; used when registration is not yet open. */
  startsInDays: number;
  registrationOpen: boolean;
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
 * SAMPLE DATA — replace with your five real Tours (and drop images into
 * /public/tours/). Kept minimal on purpose so the layout is visible.
 */
export const TOURS: Tour[] = [
  {
    id: 'sample-spring-classic',
    name: 'Spring Opener',
    image: '',
    week: 1,
    dateRange: '5. – 11. máj',
    startsInDays: 0,
    registrationOpen: true,
    difficulty: 'flat',
    prestige: 2,
    suitableFor: ['sprinter', 'rouleur'],
    jerseys: ['gc', 'points', 'mountain', 'youth'],
    totalKm: 368,
    masterStages: [
      { number: 1, name: 'Prológ', distanceKm: 12, difficulty: 'flat' },
      { number: 2, name: 'Rovinatá etapa', distanceKm: 176, difficulty: 'flat' },
      { number: 3, name: 'Zvlnená etapa', distanceKm: 180, difficulty: 'hilly' },
      { number: 4, name: 'Horská etapa', distanceKm: 165, difficulty: 'mountain' },
      { number: 5, name: 'Záverečná', distanceKm: 158, difficulty: 'flat' },
    ],
  },
  {
    id: 'sample-mountain-tour',
    name: 'Highland Tour',
    image: '',
    week: 4,
    dateRange: '26. máj – 1. jún',
    startsInDays: 12,
    registrationOpen: false,
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
];
