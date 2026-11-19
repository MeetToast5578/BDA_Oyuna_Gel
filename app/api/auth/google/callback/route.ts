import { SignJWT } from 'jose'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'
import { findOrCreateGoogleUser, googleCallbackUrl, requestOrigin, type GoogleProfile } from '@/lib/google-oauth'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { CONSENT_COOKIE, LOGIN_COOKIE, MEASUREMENT_ID } from '@/lib/analytics'

/** Sign-in trouble sends the person back to /login with a short message, never a bare JSON error. */
const failed = (request: Request, reason: 'google' | 'taken' = 'google') =>
  NextResponse.redirect(new URL(`/login?error=${reason}`, requestOrigin(request)))

const callback = async (request: Request) => {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieHeader = request.headers.get('cookie') ?? ''
  const expectedState = cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith('google_oauth_state='))
    ?.split('=')[1]

  if (!code || !state || !expectedState || state !== expectedState) {
    return failed(request)
  }

  if (!process.env.PAYLOAD_SECRET) {
    console.error('google_callback', { reason: 'PAYLOAD_SECRET is not configured' })
    return failed(request)
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: googleCallbackUrl(request),
    }),
  })

  if (!tokenResponse.ok) {
    return failed(request)
  }

  const tokens = (await tokenResponse.json()) as { access_token?: string }
  if (!tokens.access_token) {
    return failed(request)
  }

  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const profile = (await profileResponse.json()) as GoogleProfile

  // An unverified email must not sign in to (and take over) an existing account with that address.
  if (!profileResponse.ok || !profile.sub || !profile.email || profile.email_verified !== true) {
    return failed(request)
  }

  const user = await findOrCreateGoogleUser(await getPayload({ config }), profile)
  if (!user) {
    return failed(request, 'taken')
  }

  // The `google` auth strategy in collections/Users.ts resolves the session by
  // looking up `googleId`, so the JWT subject must carry the Google subject id.
  const session = await new SignJWT({ email: user.email, userId: String(user.id) })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(profile.sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(new TextEncoder().encode(process.env.PAYLOAD_SECRET))

  const next = cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith('google_oauth_next='))
    ?.split('=')[1]
  const response = NextResponse.redirect(
    new URL(safeRedirectPath(next ? decodeURIComponent(next) : null), requestOrigin(request)),
  )
  response.cookies.set('google_session', session, {
    httpOnly: true,
    maxAge: 604800,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
  for (const name of ['google_oauth_state', 'google_oauth_next']) {
    response.cookies.set(name, '', {
      httpOnly: true,
      maxAge: 0,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
  }
  // A short-lived marker counts a completed sign-in after returning to the site, only with consent.
  if (MEASUREMENT_ID && cookieHeader.split(';').some((cookie) => cookie.trim() === `${CONSENT_COOKIE}=granted`)) {
    response.cookies.set(LOGIN_COOKIE, '1', { maxAge: 60, path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
  }
  return response
}

export const GET = async (request: Request) => {
  try {
    return await callback(request)
  } catch {
    // A network error, or two sign-ins creating the same account at once: trying again works.
    console.error('google_callback', { reason: 'unexpected error' })
    return failed(request)
  }
}
