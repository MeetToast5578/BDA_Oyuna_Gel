import 'server-only'

import { cacheTag } from 'next/cache'
import { headers } from 'next/headers'
import { cache } from 'react'

import type { CurrentUser } from '@/lib/api-types'
import { initialsOf, userAvatarUrl } from '@/lib/game-backend'
import { getPayloadClient } from '@/lib/game-queries'
import { unreadNotificationCount } from '@/lib/notifications'

/**
 * The signed-in user (Payload session or Google session cookie), or null.
 * Cached per request so the header and the page share one lookup.
 *
 * `use cache: private` is what lets a session read be prefetched: the result is held in the
 * browser only, never on the server, so one signed-in user's identity can never be served to
 * another. It is also the only cache scope allowed to read `headers()`.
 *
 * Held for a few minutes, so a change to the profile (name, picture, phone) must expire it:
 * `expireSession()` in lib/session-actions.ts, called after every such change. Without it the header
 * and the phone prefills of the create and join forms keep showing the old values.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  'use cache: private'

  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() })
  if (!user || user.collection !== 'users') return null
  cacheTag(sessionTag(Number(user.id)))

  const fullName = user.fullName?.trim() || user.email
  return {
    id: Number(user.id),
    fullName,
    firstName: fullName.split(/\s+/)[0],
    initials: initialsOf(fullName),
    avatarUrl: userAvatarUrl(user),
    email: user.email,
    phoneNumber: user.phoneNumber ?? null,
  }
})

export function isGoogleAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

/** Tag on one user's cached session; `expireSession()` expires it. An id, never anything personal. */
export function sessionTag(userId: number) {
  return `session-${userId}`
}

/**
 * The header's badge: notices on `/notifications` the person hasn't opened yet (invitations, spots
 * from a waitlist, changed or cancelled games, scores). Once per request: the header renders it twice.
 */
export const getNoticeCount = cache(async (userId: number) => unreadNotificationCount(await getPayloadClient(), userId))
