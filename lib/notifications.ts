import type { Payload } from 'payload'

import type { NoticeKind } from '@/lib/notify'

/** One line per kind on `/notifications`, above the game's name. */
export const NOTICE_TEXT: Record<NoticeKind, string> = {
  invited: 'Sizi oyuna dəvət etdilər',
  promoted: 'Gözləmə siyahısından oyuna keçdiniz',
  changed: 'Oyunun vaxtı və ya yeri dəyişdi',
  cancelled: 'Oyun ləğv edildi',
  removed: 'Təşkilatçı sizi oyundan çıxardı',
  resultReported: 'Hesab daxil edildi, təsdiqinizi gözləyir',
  resultConfirmed: 'Rəqib hesabı təsdiqlədi',
  resultDisputed: 'Rəqib hesaba etiraz etdi',
  markedAbsent: 'Təşkilatçı sizi "gəlmədi" kimi qeyd etdi',
  reminder: 'Oyununuz 2 saata başlayır',
}

/** How long a notice still looks new after the visit that marked it read: that visit's refresh keeps it. */
const STILL_NEW_MS = 2 * 60_000

/** A person's latest notices, newest first. `isNew`: unread, or read within the last two minutes. */
export async function listNotifications(payload: Payload, userId: number, limit = 50, now = Date.now()) {
  const { docs } = await payload.find({
    collection: 'notifications',
    where: { user: { equals: userId } },
    sort: '-createdAt',
    limit,
    depth: 0,
    overrideAccess: true,
  })
  return docs.map((doc) => ({
    id: String(doc.id),
    kind: doc.kind,
    text: NOTICE_TEXT[doc.kind],
    gameId: typeof doc.game === 'number' ? String(doc.game) : null,
    gameTitle: doc.gameTitle,
    read: Boolean(doc.readAt),
    isNew: !doc.readAt || Date.parse(doc.readAt) > now - STILL_NEW_MS,
    createdAt: doc.createdAt,
  }))
}

/** The header's badge: notices not yet seen. */
export async function unreadNotificationCount(payload: Payload, userId: number) {
  const { totalDocs } = await payload.count({
    collection: 'notifications',
    where: { and: [{ user: { equals: userId } }, { readAt: { exists: false } }] },
    overrideAccess: true,
  })
  return totalDocs
}

/** Opening `/notifications` marks everything on it seen. */
export async function markNotificationsRead(payload: Payload, userId: number) {
  await payload.update({
    collection: 'notifications',
    where: { and: [{ user: { equals: userId } }, { readAt: { exists: false } }] },
    data: { readAt: new Date().toISOString() },
    overrideAccess: true,
  })
}
