/**
 * Short-term reminders (plan next week's training, pick Tours). These used to
 * be the Home "Manažérske úlohy". Manager tasks on Home are now long-term
 * career goals (not implemented yet), so this logic is kept UNCHANGED but is
 * not rendered anywhere for now; it will get its own place later. Pure: the
 * caller supplies the facts, the caller translates `textKey` + `params`.
 */
export interface ShortTermReminder {
  id: 'training' | 'tours';
  textKey: string;
  params: Record<string, number>;
  href: string;
}

export function shortTermReminders(input: {
  hasRider: boolean;
  hasTrainingPlan: boolean;
  plannableWeek: number;
  selectedTourCount: number;
  maxSlots: number;
  /** A scheduled Tour with open registration that has not started and is not already selected. */
  hasOpenUnselectedTour: boolean;
}): ShortTermReminder[] {
  const out: ShortTermReminder[] = [];
  if (input.hasRider && !input.hasTrainingPlan) {
    out.push({ id: 'training', textKey: 'dashboard.taskPlanTraining', params: { n: input.plannableWeek }, href: '/rider/training' });
  }
  const canPickTour = input.selectedTourCount < input.maxSlots && input.hasOpenUnselectedTour;
  if (input.hasRider && canPickTour) {
    out.push({ id: 'tours', textKey: 'dashboard.taskPickTours', params: { n: input.selectedTourCount, max: input.maxSlots }, href: '/races' });
  }
  return out;
}
