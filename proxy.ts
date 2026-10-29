import { NextResponse, type NextRequest } from 'next/server'

/** Payload's own session and the "Continue with Google" session (app/api/auth/google/callback). */
const SESSION_COOKIES = ['payload-token', 'google_session']

/**
 * Sends signed-out visitors to /login before a signed-in-only page renders.
 *
 * The pages check the session themselves too, but a `redirect()` thrown while a page renders is
 * streamed behind the already-sent static shell: a full load answers 200 with an empty body, and a
 * client-side navigation to it never commits, so "Oyun yarat" looked dead while signed out. A 307
 * here happens before any rendering and works the same for full loads, navigations and prefetches.
 *
 * Only cookie presence is checked, so this stays free of database and crypto work. A cookie that is
 * present but no longer valid falls through to the page's own check.
 */
export function proxy(request: NextRequest) {
  if (SESSION_COOKIES.some((name) => request.cookies.has(name))) return NextResponse.next()

  const { pathname, searchParams } = request.nextUrl
  // A game page is public; only "Qoşul" (?join=1) needs an account.
  if (/^\/games\/\d+$/.test(pathname) && searchParams.get('join') !== '1') return NextResponse.next()

  // Next.js has already stripped its internal `_rsc` parameter from `nextUrl`.
  const query = searchParams.toString()

  const login = new URL('/login', request.url)
  login.searchParams.set('next', query ? `${pathname}?${query}` : pathname)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: [
    '/profile',
    '/notifications',
    '/venues/suggest',
    '/games/new',
    '/teams/new',
    '/teams/join/:code',
    '/games/:id/edit',
    { source: '/games/:id', has: [{ type: 'query', key: 'join', value: '1' }] },
  ],
}
