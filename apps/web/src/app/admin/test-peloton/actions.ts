'use server';

import { revalidatePath } from 'next/cache';
import { generateTestPeloton } from '@/lib/rider/aiPeloton';

/**
 * Admin/development-only action. Not linked from any player-facing nav.
 * Idempotent: generateTestPeloton() itself refuses to create a second batch
 * of AI riders once any exist.
 */
export async function generatePelotonAction(): Promise<void> {
  await generateTestPeloton();
  revalidatePath('/admin/test-peloton');
}
