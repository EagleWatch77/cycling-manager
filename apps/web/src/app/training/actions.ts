'use server';

import { revalidatePath } from 'next/cache';
import { saveTrainingPlan, type SaveTrainingResult } from '@/lib/training/repository';
import type { TrainingIntensity, WeekType } from '@/lib/training/config';

export async function saveTrainingAction(input: {
  seasonId: string;
  weekNumber: number;
  weekType: WeekType;
  focus: string;
  intensity: TrainingIntensity;
  isRaceWeek: boolean;
  isCurrentWeek: boolean;
}): Promise<SaveTrainingResult> {
  const result = await saveTrainingPlan(input);
  if (result.ok) revalidatePath('/training');
  return result;
}
