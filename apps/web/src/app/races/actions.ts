'use server';

import { revalidatePath } from 'next/cache';
import { registerForTour } from '@/lib/races/registration';

/** Tour selection from the Races list — same underlying registration as the Tour detail page. */
export async function selectTourAction(tourId: string): Promise<void> {
  await registerForTour(tourId);
  revalidatePath('/races');
  revalidatePath(`/races/${tourId}`);
}
