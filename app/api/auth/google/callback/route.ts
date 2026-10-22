import { SignJWT } from 'jose'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'
import { findOrCreateGoogleUser, googleCallbackUrl, requestOrigin, type GoogleProfile } from '@/lib/google-oauth'
import { safeRedirectPath } from '@/lib/safe-redirect'

export const GET = async (request: Request) => {
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
    return NextResponse.json({ error: 'Invalid Google OAuth callback' }, { status: 400 })
  }

  if (!process.env.PAYLOAD_SECRET) {
    return NextResponse.json({ error: 'PAYLOAD_SECRET is not configured' }, { status: 500 })
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
    return NextResponse.json({ error: 'Google token exchange failed' }, { status: 401 })
  }

  const tokens = (await tokenResponse.json()) as { access_token?: string }
  if (!tokens.access_token) {
    return NextResponse.json({ error: 'Google did not return an access token' }, { status: 401 })
  }

  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const profile = (await profileResponse.json()) as GoogleProfile

  // An unverified email must not sign in to (and take over) an existing account with that address.
  if (!profileResponse.ok || !profile.sub || !profile.email || profile.email_verified !== true) {
    return NextResponse.json({ error: 'Could not read a verified Google profile' }, { status: 401 })
  }

  const user = await findOrCreateGoogleUser(await getPayload({ config }), profile)
  if (!user) {
    return NextResponse.json({ error: 'This email belongs to another Google account' }, { status: 409 })
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
  return response
}
