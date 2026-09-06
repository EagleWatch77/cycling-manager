'use server';

import { revalidatePath } from 'next/cache';
import { registerForTour, unregisterFromTour } from '@/lib/races/registration';

/**
 * Tour selection from the Races list — same underlying registration as the
 * Tour detail page. Revalidates every page that shows the Rider's season
 * program so selection state stays in sync everywhere immediately.
 */
function revalidateSelectionSurfaces(tourId: string): void {
  revalidatePath('/races');
  revalidatePath(`/races/${tourId}`);
  revalidatePath('/dashboard');
}

export async function selectTourAction(tourId: string): Promise<void> {
  await registerForTour(tourId);
  revalidateSelectionSurfaces(tourId);
}

export async function unselectTourAction(tourId: string): Promise<void> {
  await unregisterFromTour(tourId);
  revalidateSelectionSurfaces(tourId);
}
