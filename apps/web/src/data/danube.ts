/**
 * Canonical Danube Tour — the reference stage data.
 *
 * A synthetic elevation profile is generated per stage from its start/end
 * height, difficulty and the KOM positions, so the drawn line matches the
 * markers. Elevations are in metres; sprint and KOM markers are positions in
 * km along the stage (not counts), with KOM carrying a category 1–3.
 *
 * Weather is deliberately absent: it is race-instance data, not a fixed
 * property of the Tour.
 */
export type StageDifficulty = 'flat' | 'hilly' | 'itt' | 'mountain';
export type KomCategory = 1 | 2 | 3 | 'HC';

export interface StageMarker {
  km: number;
  kind: 'sprint' | 'kom';
  category?: KomCategory;
  /** Approximate elevation at this point, computed from the same curve as the drawn profile. */
  elevationM?: number;
}

export interface DanubeStage {
  number: number;
  from: string;
  to: string;
  km: number;
  difficulty: StageDifficulty;
  /** Height in metres at the start and finish. */
  startM: number;
  endM: number;
  markers: StageMarker[];
  /** 24 normalised samples (0–1) for the drawn profile. */
  profile: number[];
}

type RawStage = {
  number: number; from: string; to: string; km: number; difficulty: StageDifficulty;
  startM: number; endM: number; sprints: number[]; koms: [number, KomCategory][];
};

/** Real metres at a point x∈[0,1] along the stage — the same curve the profile line is drawn from. */
function heightAt(x: number, s: RawStage): number {
  let m = s.startM + (s.endM - s.startM) * x;
  for (const [km, cat] of s.koms) {
    const kx = km / s.km;
    const width = 0.1;
    const catNum = cat === 'HC' ? 0 : cat; // HC humps bigger than Cat.1
    const peak = (4 - catNum) * 220;
    m += peak * Math.exp(-((x - kx) ** 2) / (2 * width * width));
  }
  // gentle texture for flat/hilly so the line is not a ruler
  const jitter = s.difficulty === 'flat' ? 6 : 14;
  m += Math.sin(x * 18 + s.number) * jitter;
  return m;
}

/** Build a plausible normalised (0–1) profile that trends start→end and bumps up at each KOM. */
function makeProfile(s: RawStage): number[] {
  const N = 24;
  const allM = [s.startM, s.endM, ...s.koms.map(() => Math.max(s.startM, s.endM) + 250)];
  const lo = Math.min(...allM, s.startM, s.endM);
  const hi = Math.max(...allM) + 40;
  const span = Math.max(1, hi - lo);

  const out: number[] = [];
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1);
    out.push(Math.max(0, Math.min(1, (heightAt(x, s) - lo) / span)));
  }
  return out;
}

const RAW: RawStage[] = [
  { number: 1, from: 'Lunava', to: 'Merovin', km: 152, difficulty: 'flat', startM: 132, endM: 128, sprints: [58, 111], koms: [] },
  { number: 2, from: 'Karsen', to: 'Veldra', km: 164, difficulty: 'hilly', startM: 146, endM: 212, sprints: [67], koms: [[55, 3], [101, 2], [158, 3]] },
  { number: 3, from: 'Torvyn', to: 'Drevana', km: 126, difficulty: 'hilly', startM: 158, endM: 612, sprints: [68], koms: [[47, 3], [99, 2], [126, 2]] },
  { number: 4, from: 'Drevana', to: 'Solmere', km: 34, difficulty: 'itt', startM: 612, endM: 184, sprints: [], koms: [] },
  { number: 5, from: 'Solmere', to: 'Ardava', km: 168, difficulty: 'mountain', startM: 184, endM: 1420, sprints: [91], koms: [[71, 2], [128, 1], [168, 1]] },
];

export const DANUBE_STAGES: DanubeStage[] = RAW.map((s) => ({
  number: s.number,
  from: s.from,
  to: s.to,
  km: s.km,
  difficulty: s.difficulty,
  startM: s.startM,
  endM: s.endM,
  markers: [
    ...s.sprints.map((km) => ({
      km, kind: 'sprint' as const, elevationM: Math.round(heightAt(km / s.km, s)),
    })),
    ...s.koms.map(([km, category]) => ({
      km, kind: 'kom' as const, category, elevationM: Math.round(heightAt(km / s.km, s)),
    })),
  ],
  profile: makeProfile(s),
}));

export const DANUBE_META = {
  id: 'danube-tour',
  name: 'Danube Tour',
  tagline: 'Ride the Great River',
  raceType: 'mixed' as const,
  totalKm: DANUBE_STAGES.reduce((s, x) => s + x.km, 0),
};
