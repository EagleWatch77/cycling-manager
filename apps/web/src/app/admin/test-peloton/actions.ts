'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin/auth';
import { generateTestPeloton } from '@/lib/rider/aiPeloton';

/**
 * Admin/development-only action. Not linked from any player-facing nav.
 * Idempotent: generateTestPeloton() itself refuses to create a second batch
 * of AI riders once any exist. A server action is a real network endpoint
 * (POST to an internal Next.js route) regardless of whether the page that
 * renders its <form> is itself protected, so it re-checks admin status
 * on its own rather than trusting the caller reached it via a guarded page.
 */
export async function generatePelotonAction(): Promise<void> {
  await requireAdmin();
  await generateTestPeloton();
  revalidatePath('/admin/test-peloton');
}
