'use server';

import { revalidatePath } from 'next/cache';
import { saveTrainingPlan, cancelTrainingPlan, type SaveTrainingResult, type CancelTrainingResult } from '@/lib/training/repository';
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

export async function cancelTrainingAction(input: {
  seasonId: string;
  weekNumber: number;
  isCurrentWeek: boolean;
}): Promise<CancelTrainingResult> {
  const result = await cancelTrainingPlan(input);
  if (result.ok) revalidatePath('/training');
  return result;
}
