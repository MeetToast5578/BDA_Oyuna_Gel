import type { Payload } from 'payload'
import webpush from 'web-push'

import { SITE_URL } from '@/lib/site-url'

export type PushMessage = { title: string; body: string; url: string }

const vapid = () => {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  return publicKey && privateKey ? { publicKey, privateKey, subject: process.env.VAPID_SUBJECT || SITE_URL } : null
}

/** Phone notifications are on once both VAPID keys are set (docs/handoff.md); until then nothing is sent. */
export const pushConfigured = () => vapid() !== null

/**
 * Sends `message` to every device these users turned notifications on for. A device the push service
 * says is gone (404, 410) is deleted. Never throws, like the email: a notice must not fail what caused
 * it. Returns how many were accepted.
 */
export async function sendPush(payload: Payload, userIds: number[], message: PushMessage) {
  const keys = vapid()
  if (!keys || userIds.length === 0) return 0
  try {
    const { docs } = await payload.find({
      collection: 'push-subscriptions',
      where: { user: { in: userIds } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
    const results = await Promise.allSettled(
      docs.map((device) =>
        webpush
          .sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, JSON.stringify(message), {
            vapidDetails: keys,
            TTL: 60 * 60,
          })
          .catch(async (error: { statusCode?: number }) => {
            if (error.statusCode === 404 || error.statusCode === 410) {
              await payload.delete({ collection: 'push-subscriptions', id: device.id, overrideAccess: true })
            }
            throw error
          }),
      ),
    )
    for (const result of results) if (result.status === 'rejected' && ![404, 410].includes(result.reason?.statusCode)) console.error('Failed to send push', result.reason)
    return results.filter((result) => result.status === 'fulfilled').length
  } catch (error) {
    console.error('Failed to send push', error)
    return 0
  }
}
