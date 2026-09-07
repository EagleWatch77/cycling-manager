'use server';

import { revalidatePath } from 'next/cache';
import { saveTrainingPlan, type SaveTrainingResult } from '@/lib/training/repository';
import type { TrainingIntensity } from '@/lib/training/config';

export async function saveTrainingAction(input: {
  seasonId: string;
  weekNumber: number;
  focus: string;
  intensity: TrainingIntensity;
}): Promise<SaveTrainingResult> {
  const result = await saveTrainingPlan(input);
  if (result.ok) revalidatePath('/training');
  return result;
}
