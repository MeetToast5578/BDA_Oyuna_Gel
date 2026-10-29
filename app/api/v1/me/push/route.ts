import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { clientIp, isRateLimited, rateLimitedResponse } from '@/lib/rate-limit'
import { requireUser } from '@/lib/team-routes'

/** What the browser's PushSubscription serialises to; the endpoint is the push service's https URL. */
function parseSubscription(body: unknown) {
  const { endpoint, keys } = (body ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  const key = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{8,200}={0,2}$/.test(value)
  if (typeof endpoint !== 'string' || endpoint.length > 1000 || !endpoint.startsWith('https://') || !key(keys?.p256dh) || !key(keys?.auth)) return null
  return { endpoint, p256dh: keys?.p256dh as string, auth: keys?.auth as string }
}

/** "Bu cihaza bildiriş göndər" on: saves this device for the signed-in person (a device that changed hands moves to them). */
export async function POST(request: Request) {
  try {
    const auth = await requireUser(request)
    if ('error' in auth) return auth.error
    if (await isRateLimited(auth.payload, 'pushSubscribe', { userId: auth.userId, ip: clientIp(request) })) return rateLimitedResponse()

    const device = parseSubscription(await request.json().catch(() => null))
    if (!device) return apiError('INVALID_SUBSCRIPTION', 'Bildiriş abunəliyi yanlışdır.', 400)

    const { docs } = await auth.payload.find({
      collection: 'push-subscriptions',
      where: { endpoint: { equals: device.endpoint } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (docs[0]) {
      await auth.payload.update({ collection: 'push-subscriptions', id: docs[0].id, data: { ...device, user: auth.userId }, overrideAccess: true })
    } else {
      await auth.payload.create({ collection: 'push-subscriptions', data: { ...device, user: auth.userId }, overrideAccess: true })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Bildirişləri açmaq mümkün olmadı.', 500)
  }
}

/** Off: forgets this device (`{ endpoint }`), only if it is the signed-in person's. */
export async function DELETE(request: Request) {
  try {
    const auth = await requireUser(request)
    if ('error' in auth) return auth.error
    const { endpoint } = ((await request.json().catch(() => null)) ?? {}) as { endpoint?: unknown }
    if (typeof endpoint !== 'string') return apiError('INVALID_SUBSCRIPTION', 'Bildiriş abunəliyi yanlışdır.', 400)
    await auth.payload.delete({
      collection: 'push-subscriptions',
      where: { and: [{ endpoint: { equals: endpoint } }, { user: { equals: auth.userId } }] },
      overrideAccess: true,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Bildirişləri söndürmək mümkün olmadı.', 500)
  }
}
