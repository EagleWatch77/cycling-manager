'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase client for browser (client component) use. Reads the public env
 * vars; the anon key is meant to be public and is protected by row-level
 * security on the database side, not by being hidden.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
