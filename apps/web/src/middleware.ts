import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

/** Run on pages only; skip static assets, images and the favicon. */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:webp|png|svg|ico)$).*)'],
};
