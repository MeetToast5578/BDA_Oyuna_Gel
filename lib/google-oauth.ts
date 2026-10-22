import { randomBytes } from 'crypto'
import type { Payload } from 'payload'

/**
 * The origin the visitor is on, e.g. http://localhost:3000 or https://bda-next-six.vercel.app.
 * Read from the forwarding headers because on Vercel `request.url` reports the internal
 * http://localhost:3000 instead of the public domain.
 */
export function requestOrigin(request: Request) {
  const url = new URL(request.url)
  const host = firstValue(request.headers.get('x-forwarded-host')) ?? request.headers.get('host') ?? url.host
  const proto = firstValue(request.headers.get('x-forwarded-proto')) ?? url.protocol.slice(0, -1)
  return `${proto === 'https' ? 'https' : 'http'}://${host}`
}

/**
 * Where Google sends the user back after sign-in: this route on the host they started from
 * (http://localhost:3000 locally, the Vercel domain in production). Each origin must be listed
 * under "Authorized redirect URIs" in the Google Cloud OAuth client.
 */
export function googleCallbackUrl(request: Request) {
  return new URL('/api/auth/google/callback', requestOrigin(request)).toString()
}

export type GoogleProfile = {
  sub: string
  email: string
  email_verified?: boolean
  name?: string
  picture?: string
}

/**
 * The account a verified Google profile signs in to. The Google id decides; an email match only
 * links an account no Google id owns yet (one an admin or the seed created). An account whose
 * email matches but that belongs to another Google id is refused (null), never taken over.
 */
export async function findOrCreateGoogleUser(payload: Payload, profile: GoogleProfile) {
  const byGoogleId = await payload.find({
    collection: 'users',
    where: { googleId: { equals: profile.sub } },
    limit: 1,
    overrideAccess: true,
  })
  let existing = byGoogleId.docs[0]
  if (!existing) {
    const byEmail = await payload.find({
      collection: 'users',
      where: { email: { equals: profile.email } },
      limit: 1,
      overrideAccess: true,
    })
    if (byEmail.docs[0]?.googleId) return null
    existing = byEmail.docs[0]
  }

  const data = { googleId: profile.sub, fullName: profile.name ?? profile.email, avatarUrl: profile.picture ?? null }
  return existing
    ? payload.update({ collection: 'users', id: existing.id, overrideAccess: true, data })
    : payload.create({
        collection: 'users',
        overrideAccess: true,
        data: { ...data, email: profile.email, password: randomBytes(32).toString('hex') },
      })
}

/** Proxies may join several values with commas; the first is the one the client used. */
function firstValue(header: string | null) {
  return header?.split(',')[0].trim() || undefined
}
