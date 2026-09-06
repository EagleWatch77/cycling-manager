'use server';

import { revalidatePath } from 'next/cache';
import {
  registerForTour, unregisterFromTour, type RegisterResult, type UnregisterResult,
} from '@/lib/races/registration';

/** Same shared registration used by the Races list — kept in sync across pages. */
function revalidateSelectionSurfaces(tourId: string): void {
  revalidatePath(`/races/${tourId}`);
  revalidatePath('/races');
  revalidatePath('/dashboard');
}

/**
 * Registers the current Rider for a Tour and reports back what happened, so
 * the client button can show a real error instead of silently doing nothing.
 */
export async function registerForTourAction(tourId: string): Promise<RegisterResult> {
  const result = await registerForTour(tourId);
  if (result.ok) revalidateSelectionSurfaces(tourId);
  return result;
}

export async function unregisterFromTourAction(tourId: string): Promise<UnregisterResult> {
  const result = await unregisterFromTour(tourId);
  if (result.ok) revalidateSelectionSurfaces(tourId);
  return result;
}
