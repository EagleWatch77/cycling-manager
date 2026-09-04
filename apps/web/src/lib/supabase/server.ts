import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * Supabase client for server components and route handlers. Bridges Supabase's
 * auth cookies to Next's cookie store so a session survives navigation.
 *
 * In a plain server component the cookie `set` calls are no-ops (RSCs cannot
 * write headers); that is expected and harmless because the middleware is what
 * actually refreshes the session cookie on each request.
 */
export async function createClient() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return store.getAll();
        },
        setAll(toSet) {
          try {
            for (const { name, value, options } of toSet) store.set(name, value, options);
          } catch {
            // Called from a server component; middleware handles the refresh.
          }
        },
      },
    },
  );
}
