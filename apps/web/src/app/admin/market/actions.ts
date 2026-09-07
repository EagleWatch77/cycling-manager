'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin/auth';
import { generateMarketPool, resetAvailableMarketPool, type GenerateMarketPoolResult } from '@/lib/market/repository';

/**
 * Both actions are real network endpoints (server actions), independent of
 * whether the page rendering their <form> is itself protected — each
 * re-checks admin status on its own, same pattern as
 * /admin/test-peloton/actions.ts's generatePelotonAction.
 */

export async function generateMarketPoolAction(seasonId: string): Promise<GenerateMarketPoolResult> {
  await requireAdmin();
  const result = await generateMarketPool({ seasonId, source: 'admin' });
  if (result.ok) revalidatePath('/admin/market');
  return result;
}

export async function resetMarketPoolAction(seasonId: string): Promise<{ ok: boolean; deleted: number }> {
  await requireAdmin();
  const result = await resetAvailableMarketPool(seasonId);
  if (result.ok) revalidatePath('/admin/market');
  return result;
}
