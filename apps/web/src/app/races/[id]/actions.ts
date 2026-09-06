'use server';

import { revalidatePath } from 'next/cache';
import { registerForTour, unregisterFromTour } from '@/lib/races/registration';

/** Same shared registration used by the Races list — kept in sync across pages. */
function revalidateSelectionSurfaces(tourId: string): void {
  revalidatePath(`/races/${tourId}`);
  revalidatePath('/races');
  revalidatePath('/dashboard');
}

export async function registerForTourAction(tourId: string): Promise<void> {
  await registerForTour(tourId);
  revalidateSelectionSurfaces(tourId);
}

export async function unregisterFromTourAction(tourId: string): Promise<void> {
  await unregisterFromTour(tourId);
  revalidateSelectionSurfaces(tourId);
}
