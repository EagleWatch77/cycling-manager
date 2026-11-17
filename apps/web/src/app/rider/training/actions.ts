'use server';

import { revalidatePath } from 'next/cache';
import { saveTrainingPlan, type SaveTrainingResult } from '@/lib/training/repository';
import type { TrainingIntensity, WeekType } from '@/lib/training/config';
import { saveDevelopmentPlan, type SaveDevelopmentPlanResult } from '@/lib/training/developmentPlan';
import type { TrainingMode } from '@/lib/training/development/config';

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

/** Seven-plan training: only plan id + mode are forwarded (rider, season, week come from the database calendar). */
export async function saveDevelopmentPlanAction(input: { planId: number; mode: TrainingMode }): Promise<SaveDevelopmentPlanResult> {
  const result = await saveDevelopmentPlan(input.planId, input.mode);
  if (result.ok) revalidatePath('/rider/training');
  return result;
}
