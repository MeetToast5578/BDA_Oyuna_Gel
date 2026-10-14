import { after } from 'next/server'
import type { Payload } from 'payload'

import type { Email } from '@/lib/emails'

/**
 * Sends `email` to each of these users who has an address and hasn't turned emails off on their
 * profile. Never throws: an email is a courtesy, and a mail-server problem must never fail the join,
 * edit or delete that caused it. Returns how many were handed to the mail server.
 */
export async function notify(payload: Payload, userIds: number[], email: Email) {
  if (userIds.length === 0) return 0
  try {
    const { docs } = await payload.find({
      collection: 'users',
      where: { id: { in: userIds } },
      select: { email: true, emailNotifications: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
    const recipients = docs.filter((user) => user.email && user.emailNotifications !== false)
    const results = await Promise.allSettled(recipients.map((user) => payload.sendEmail({ to: user.email, ...email })))
    for (const result of results) if (result.status === 'rejected') console.error('Failed to send email', result.reason)
    return results.filter((result) => result.status === 'fulfilled').length
  } catch (error) {
    console.error('Failed to send email', error)
    return 0
  }
}

/**
 * Sends after the response, so the player isn't kept waiting on the mail server. `after` only exists
 * inside a request; called elsewhere (a test calling a route directly) it throws, and the email must
 * never be what fails the request, so then the task just runs now, unawaited.
 */
export function afterResponse(task: () => Promise<unknown>) {
  try {
    after(task)
  } catch {
    void task()
  }
}

/** Everyone holding a spot in a game except `exceptUserId` (the host, who made the change). */
export async function participantIds(payload: Payload, gameId: number, exceptUserId: number | null) {
  const { docs } = await payload.find({
    collection: 'game-participants',
    where: { game: { equals: gameId } },
    select: { user: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return docs
    .map((row) => (typeof row.user === 'object' ? row.user?.id : row.user))
    .filter((id): id is number => typeof id === 'number' && id !== exceptUserId)
}
