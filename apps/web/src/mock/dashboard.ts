/**
 * MOCK DASHBOARD DATA — demo only.
 *
 * Everything here is fictional and isolated from components on purpose. When
 * real data arrives this file is replaced by loaders; no component imports it
 * directly, they receive it as props from the page.
 *
 * The Race Engine is NOT consulted here. No engine import, no simulation, no
 * balance constant is read. This is presentation data only.
 */
import type { LeagueId } from '@/lib/leagues';

export interface Player {
  riderName: string;
  age: number;
  league: LeagueId;
  countryFlag: string;
  styleKey: string;
  budget: number;
  energy: number;
  form: number;
  fitness: number;
  morale: number;
  notifications: number;
  seasonRank: number;
  seasonFieldSize: number;
  seasonPoints: number;
}

export const PLAYER: Player = {
  riderName: 'Martin Zeman',
  age: 22,
  league: 'rookie',
  countryFlag: '🇸🇰',
  styleKey: 'style.climber',
  budget: 48500,
  energy: 82,
  form: 74,
  fitness: 68,
  morale: 88,
  notifications: 3,
  seasonRank: 14,
  seasonFieldSize: 96,
  seasonPoints: 268,
};

export const RIDER_ATTRIBUTES: { labelKey: string; value: number }[] = [
  { labelKey: 'attr.climbing', value: 84 },
  { labelKey: 'attr.hills', value: 78 },
  { labelKey: 'attr.flat', value: 61 },
  { labelKey: 'attr.endurance', value: 73 },
  { labelKey: 'attr.sprint', value: 52 },
  { labelKey: 'attr.descending', value: 69 },
];

export interface LiveRace {
  tourName: string;
  stageNumber: number;
  stageName: string;
  isLive: boolean;
  remainingKm: number;
  startsInLabel?: string;
  breakawayRiders: number;
  breakawayGapSec: number;
  pelotonSize: number;
  /** Normalised elevation samples, 0..1. */
  profile: number[];
}

export const LIVE_RACE: LiveRace = {
  tourName: 'Danube Tour',
  stageNumber: 2,
  stageName: 'Vyšehrad — Ostrihom',
  isLive: true,
  remainingKm: 24.6,
  breakawayRiders: 4,
  breakawayGapSec: 138,
  pelotonSize: 31,
  profile: [
    .22,.24,.21,.26,.31,.28,.34,.44,.52,.47,.39,.33,.36,.42,.58,.71,.66,.54,
    .43,.38,.41,.49,.63,.78,.9,.74,.58,.46,.37,.31,.28,.3,.35,.29,.25,.23,
  ],
};

export interface CalendarEvent {
  id: string;
  name: string;
  stageCount: number;
  dateRange: string;
  startsInDays: number;
  status: 'live' | 'upcoming';
}

export const SEASON_CALENDAR: CalendarEvent[] = [
  { id: 'danube-tour', name: 'Danube Tour', stageCount: 5, dateRange: '12. – 16. máj', startsInDays: 0, status: 'live' },
  { id: 'karst-classic', name: 'Karst Classic', stageCount: 1, dateRange: '24. máj', startsInDays: 12, status: 'upcoming' },
  { id: 'tatra-ascent', name: 'Tatra Ascent', stageCount: 3, dateRange: '2. – 4. jún', startsInDays: 21, status: 'upcoming' },
];

export interface TourStage {
  number: number;
  name: string;
  distanceKm: number;
  terrainKey: string;
  difficulty: 'flat' | 'hilly' | 'mountain';
  profile: number[];
}

/**
 * Canonical master Tour: always 5 stages in the data.
 * The UI slices this by league via `visibleStages()`.
 */
export const DANUBE_TOUR = {
  id: 'danube-tour',
  name: 'Danube Tour',
  heroImage: '/tours/danube.webp',
  startsInDays: 0,
  focusKey: 'attr.hills',
  weather: 'Premenlivé',
  weatherEn: 'Changeable',
  masterStages: [
    { number: 1, name: 'Bratislava — Nitra', distanceKm: 148, terrainKey: 'attr.flat', difficulty: 'flat',
      profile: [.2,.22,.19,.24,.21,.26,.23,.28,.25,.3,.27,.24,.22,.26,.23,.21] },
    { number: 2, name: 'Vyšehrad — Ostrihom', distanceKm: 162, terrainKey: 'attr.hills', difficulty: 'hilly',
      profile: [.24,.31,.28,.44,.52,.39,.36,.58,.71,.54,.43,.49,.78,.9,.58,.31] },
    { number: 3, name: 'Komárno — Štúrovo', distanceKm: 134, terrainKey: 'attr.flat', difficulty: 'flat',
      profile: [.18,.2,.24,.21,.19,.23,.26,.22,.2,.25,.28,.24,.21,.19,.22,.2] },
    { number: 4, name: 'Banská — Donovaly', distanceKm: 171, terrainKey: 'attr.climbing', difficulty: 'mountain',
      profile: [.22,.3,.42,.55,.48,.62,.78,.7,.58,.72,.88,.95,.8,.6,.44,.34] },
    { number: 5, name: 'Poprad — Štrbské Pleso', distanceKm: 156, terrainKey: 'attr.climbing', difficulty: 'mountain',
      profile: [.26,.34,.3,.46,.6,.52,.68,.84,.76,.9,.98,.88,.74,.62,.5,.42] },
  ] as TourStage[],
};

export interface StandingRow {
  position: number;
  rider: string;
  flag: string;
  isPlayer?: boolean;
  timeSec: number;
  gapSec: number;
}

export const STANDINGS: StandingRow[] = [
  { position: 1, rider: 'Andrej Hoľka', flag: '🇸🇰', timeSec: 66272, gapSec: 0 },
  { position: 2, rider: 'Tomas Rehak', flag: '🇨🇿', timeSec: 66272, gapSec: 24 },
  { position: 3, rider: 'Martin Zeman', flag: '🇸🇰', isPlayer: true, timeSec: 66272, gapSec: 78 },
  { position: 4, rider: 'Bence Almasi', flag: '🇭🇺', timeSec: 66272, gapSec: 125 },
  { position: 5, rider: 'Lukas Brenner', flag: '🇦🇹', timeSec: 66272, gapSec: 168 },
];

export interface AnalysisSlice { labelKey: string; seconds: number; color: string }

export const LAST_STAGE_ANALYSIS = {
  stageLabel: 'Danube Tour — Etapa 1',
  netSeconds: 78,
  slices: [
    { labelKey: 'analysis.climbs', seconds: 62, color: '#0e9384' },
    { labelKey: 'analysis.flats', seconds: -18, color: '#38bdf8' },
    { labelKey: 'analysis.descents', seconds: 28, color: '#d97706' },
    { labelKey: 'analysis.sprints', seconds: -12, color: '#a78bfa' },
    { labelKey: 'analysis.other', seconds: 18, color: '#94a3b8' },
  ] as AnalysisSlice[],
};

export interface EquipmentItem { slotKey: string; name: string; condition: number; icon: string }

export const EQUIPMENT: EquipmentItem[] = [
  { slotKey: 'equipment.frame', name: 'Aeris RC-2', condition: 94, icon: 'frame' },
  { slotKey: 'equipment.wheels', name: 'Vortex 45', condition: 81, icon: 'wheel' },
  { slotKey: 'equipment.drivetrain', name: 'Cadence 12s', condition: 88, icon: 'chain' },
  { slotKey: 'equipment.helmet', name: 'Streamline A1', condition: 76, icon: 'helmet' },
];

export const NEXT_TRAINING = {
  name: 'Intervaly do kopca',
  nameEn: 'Hill intervals',
  scheduled: '15. máj',
  scheduledEn: '15 May',
  load: 72,
};
