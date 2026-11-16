'use server';

import { revalidatePath } from 'next/cache';
import { reserveMarketRider, type ReserveResult } from '@/lib/market/swap';

/** Thin wrapper: all rules live in reserve_market_rider() (security definer). */
export async function buyMarketRiderAction(marketRiderId: string): Promise<ReserveResult> {
  const result = await reserveMarketRider(marketRiderId);
  if (result.ok) {
    revalidatePath('/transfers');
    revalidatePath('/rider/contract');
  }
  return result;
}
