import { redirect } from 'next/navigation';

/**
 * Training now lives as a tab of the rider profile (/rider/training) —
 * kept as a redirect, not deleted outright, in case any stale bookmark or
 * external link still points at the old top-level route. Nothing in this
 * codebase references /training directly anymore (see lib/navigation.ts).
 */
export default function TrainingRedirectPage() {
  redirect('/rider/training');
}
