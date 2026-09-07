import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/auth';
import { getAdminRiderRawList } from '@/lib/rider/adminRepository';
import { AdminRiderTable } from '@/components/admin/AdminRiderTable';

/**
 * Internal admin tool — never linked from the player sidebar
 * (lib/navigation.ts). requireAdmin() redirects away anyone who isn't in
 * public.admin_users before this ever fetches a row; the riders_select_admin
 * RLS policy is the independent second guard on the data itself. Not
 * localized on purpose, matching /admin/test-peloton's existing convention:
 * this is a developer tool, not player-facing game UI.
 */
export default async function AdminRidersPage() {
  const admin = await requireAdmin();
  const riders = await getAdminRiderRawList();

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <span className="inline-block rounded bg-danger px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-white">
          Admin
        </span>
        <h1 className="mt-2 text-xl font-bold text-navy">Rider Inspector</h1>
        <p className="mt-1 text-sm text-navy-soft">
          Raw, unfiltered rider data — signed in as {admin.email ?? admin.id}. Internal tool, not part of the player-facing game.
        </p>
        <Link href="/admin/market" className="mt-1 inline-block text-2xs font-semibold text-teal hover:underline">
          → Market Tools
        </Link>
      </div>

      <AdminRiderTable riders={riders} />
    </div>
  );
}
