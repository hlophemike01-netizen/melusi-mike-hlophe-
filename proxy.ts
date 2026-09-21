import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Next.js 16 renamed the `middleware` file convention to `proxy`. This runs on
 * every matched request to refresh the Supabase session and redirect
 * unauthenticated visitors.
 *
 * It is not an authorisation boundary — Row Level Security is. This exists so a
 * signed-out visitor gets a clean redirect instead of an empty page.
 */
export default async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. The service worker and
     * manifest are handled as public paths inside updateSession.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
