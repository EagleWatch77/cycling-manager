/**
 * Tour scoring rules — stored ONCE, shared by every stage. This is the rulebook
 * a Tour scores by; stages reference it, they do not each carry their own copy.
 *
 * Display-only for now: nothing here calculates results. It shows the player how
 * many points and time bonuses each checkpoint is worth.
 */

export const SCORING = {
  /** Points for the first N finishers of a stage. */
  stageFinishPoints: [25, 20, 16, 13, 11],

  /** Intermediate sprint: points for the first three, plus a GC time bonus. */
  intermediateSprint: {
    points: [8, 5, 3],
    gcBonusSec: [3, 2, 1],
  },

  /** GC time bonus at the stage finish for the first three. */
  stageFinishBonusSec: [10, 6, 4],

  /** KOM points by climb category, top finishers over the summit. */
  kom: {
    1: [12, 8, 5, 3, 1],
    2: [8, 5, 3, 2, 1],
    3: [5, 3, 2, 1],
  } as Record<1 | 2 | 3, number[]>,
} as const;

/** Compact "a/b/c" string helper for the summaries. */
export function slash(nums: readonly number[]): string {
  return nums.join('/');
}
