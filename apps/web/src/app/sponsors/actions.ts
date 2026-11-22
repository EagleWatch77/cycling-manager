'use server';

import { revalidatePath } from 'next/cache';
import { rejectMySponsorOffer } from '@/lib/sponsors/repository';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Odmietnuť ponuku: the only sponsor action that is live today (no money moves). Ownership is enforced in the database. */
export async function rejectSponsorOfferAction(formData: FormData): Promise<void> {
  const id = String(formData.get('offerId') ?? '');
  if (!UUID.test(id)) return;
  await rejectMySponsorOffer(id);
  revalidatePath('/sponsors');
}
