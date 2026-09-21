import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, generateNonce } from '@/lib/csp';
import { publicEnv } from '@/lib/env';

/**
 * Refreshes the auth session on every request and decides whether the route is
 * reachable.
 *
 * Route protection lives here AND in each server component's own session check.
 * Middleware alone is not an authorisation boundary — RLS is — but it gives a
 * clean redirect instead of an empty page.
 *
 * It is also where the Content-Security-Policy is attached, because the nonce
 * has to be minted per request and handed to the renderer before the page is
 * built.
 */
const PUBLIC_PREFIXES = [
  '/sign-in',
  '/sign-up',
  '/reset-password',
  '/update-password',
  '/auth',
  '/legal',
  '/shared', // token-based location share links
  '/manifest.webmanifest',
  '/sw.js',
  '/icons',
  '/offline',
  '/ui-preview', // dev-only interface harness; returns 404 in production
  // Crawler files. Without these the proxy redirects Googlebot to /sign-in and
  // the site cannot be indexed at all — the redirect is a 307, so the crawler
  // sees an auth wall rather than a sitemap.
  '/robots.txt',
  '/sitemap.xml',
  '/og.png',
];

function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const nonce = generateNonce();
  const csp = buildCsp(nonce, process.env.NODE_ENV !== 'production');

  /**
   * Next.js reads `Content-Security-Policy` off the *request* headers to find
   * the nonce it should stamp on its own bootstrap scripts. Without that, the
   * framework's own inline script is blocked by the policy we just wrote and
   * the page never hydrates. `x-nonce` is the copy our components read.
   *
   * Headers are rebuilt from `request.headers` on every call rather than
   * captured once, because Supabase mutates the request's cookie header while
   * refreshing the session and a stale copy would drop the new tokens.
   */
  function proceed(): NextResponse {
    const headers = new Headers(request.headers);
    headers.set('x-nonce', nonce);
    headers.set('Content-Security-Policy', csp);

    const res = NextResponse.next({ request: { headers } });
    res.headers.set('Content-Security-Policy', csp);
    return res;
  }

  function redirectTo(url: URL): NextResponse {
    const res = NextResponse.redirect(url);
    res.headers.set('Content-Security-Policy', csp);
    return res;
  }

  let response = proceed();

  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    // Without configuration there is no session to refresh. Let the page render
    // its own setup message rather than redirect-looping.
    return response;
  }

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = proceed();
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() revalidates the token with Supabase. getSession() only decodes
  // the cookie, so it must not be used for an access decision.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/sign-in';
    redirectUrl.searchParams.set('next', pathname);
    return redirectTo(redirectUrl);
  }

  if (user && (pathname === '/sign-in' || pathname === '/sign-up')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/home';
    redirectUrl.search = '';
    return redirectTo(redirectUrl);
  }

  return response;
}
