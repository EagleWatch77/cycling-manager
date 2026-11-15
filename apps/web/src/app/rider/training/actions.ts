'use server';

import { revalidatePath } from 'next/cache';
import { saveTrainingPlan, type SaveTrainingResult } from '@/lib/training/repository';
import type { TrainingIntensity, WeekType } from '@/lib/training/config';

export async function saveTrainingAction(input: {
  weekType: WeekType;
  focus: string;
  intensity: TrainingIntensity;
}): Promise<SaveTrainingResult> {
  // Only type/focus/intensity are forwarded: season, week and player are never
  // taken from the client (save_my_training_plan() derives them).
  const result = await saveTrainingPlan({ weekType: input.weekType, focus: input.focus, intensity: input.intensity });
  if (result.ok) revalidatePath('/rider/training');
  return result;
}
