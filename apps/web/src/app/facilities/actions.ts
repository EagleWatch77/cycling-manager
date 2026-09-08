'use server';

import { revalidatePath } from 'next/cache';
import { upgradeFacility as upgradeFacilityRepo, type UpgradeFacilityResult } from '@/lib/facilities/repository';
import { performService as performServiceRepo, type PerformServiceResult } from '@/lib/facilities/bike';
import { getMyRider } from '@/lib/rider/repository';
import type { FacilityId } from '@/lib/facilities/config';

/**
 * Thin action wrapper — all real validation (auth, league cap, Team Center
 * cap, admin bypass, double-click safety) happens server-side in the
 * upgrade_facility() Postgres function (security definer, see
 * supabase/schema.sql) via lib/facilities/repository.ts. This action exists
 * only to be callable from the client and to revalidate the page afterwards.
 */
export async function upgradeFacilityAction(facility: FacilityId): Promise<UpgradeFacilityResult> {
  const result = await upgradeFacilityRepo(facility);
  if (result.ok) revalidatePath('/facilities');
  return result;
}

export async function performServiceAction(): Promise<PerformServiceResult> {
  const rider = await getMyRider();
  if (!rider) return { ok: false, reason: 'no-rider' };

  const result = await performServiceRepo(rider.id);
  if (result.ok) revalidatePath('/facilities');
  return result;
}
