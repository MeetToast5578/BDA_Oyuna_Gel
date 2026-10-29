import { after } from 'next/server'
import type { Payload } from 'payload'

import type { NOTICE_KINDS } from '@/collections/Notifications'
import { invitedEmail, type Email } from '@/lib/emails'
import type { InviteEntry } from '@/lib/team-logic'

export type NoticeKind = (typeof NOTICE_KINDS)[number]

/** What `/notifications` shows. `gameId` is null for a game that is being deleted, which keeps only its name. */
export type Notice = { kind: NoticeKind; gameId: number | null; gameTitle: string }

/** A notice about this game, linking to it. */
export const noticeFor = (kind: NoticeKind, game: { id: string | number; title: string }): Notice => ({
  kind,
  gameId: Number(game.id),
  gameTitle: game.title,
})

/**
 * Tells each of these users: one row each on their `/notifications` (none when `notice` is null: the
 * person did it themselves), then `email` to those who have
 * an address and haven't turned emails off. Never throws: a notice is a courtesy, and a failure must
 * never fail the join, edit or delete that caused it. Returns how many emails reached the mail server.
 */
export async function notify(payload: Payload, userIds: number[], notice: Notice | null, email?: Email) {
  if (userIds.length === 0) return 0
  try {
    if (notice)
      await Promise.all(
        userIds.map((user) =>
          payload.create({ collection: 'notifications', data: { user, kind: notice.kind, game: notice.gameId, gameTitle: notice.gameTitle }, overrideAccess: true }),
        ),
      )
  } catch (error) {
    console.error('Failed to save notices', error)
  }
  if (!email) return 0
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

/** Everyone holding a spot in a game except `exceptUserId` (the host, who made the change); only `side`'s players when given. */
export async function participantIds(payload: Payload, gameId: number, exceptUserId: number | null, side?: 'home' | 'away') {
  const { docs } = await payload.find({
    collection: 'game-participants',
    where: side ? { and: [{ game: { equals: gameId } }, { side: { equals: side } }] } : { game: { equals: gameId } },
    select: { user: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return docs
    .map((row) => (typeof row.user === 'object' ? row.user?.id : row.user))
    .filter((id): id is number => typeof id === 'number' && id !== exceptUserId)
}

/** Tells each invited player which side they were invited to, naming it after the club when it has one. */
export async function notifyInvited(
  payload: Payload,
  game: Parameters<typeof invitedEmail>[0] & { teams: { home: { name: string } | null; away: { name: string } | null } },
  entries: InviteEntry[],
) {
  for (const side of ['home', 'away'] as const) {
    const ids = entries.filter((entry) => entry.side === side).map((entry) => entry.userId)
    const label = game.teams[side]?.name ?? (side === 'home' ? 'A komandası' : 'B komandası')
    await notify(payload, ids, noticeFor('invited', game), invitedEmail(game, side, label))
  }
}
