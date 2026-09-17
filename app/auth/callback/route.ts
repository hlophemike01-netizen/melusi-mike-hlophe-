import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Auth callback for email confirmation and password reset links.
 *
 * Exchanges the one-time code for a session. The `next` parameter is checked
 * to be a same-site path before it is used — an open redirect here would let a
 * crafted confirmation link land a freshly authenticated user on a phishing
 * page with their session already established.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next') ?? '/home';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/home';

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=link_invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/sign-in?error=link_expired`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
