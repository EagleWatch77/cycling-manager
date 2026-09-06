'use server';

import { revalidatePath } from 'next/cache';
import { registerForTour } from '@/lib/races/registration';

export async function registerForTourAction(tourId: string): Promise<void> {
  await registerForTour(tourId);
  revalidatePath(`/races/${tourId}`);
}
