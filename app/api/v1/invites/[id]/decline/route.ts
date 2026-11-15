import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { getPayloadClient } from '@/lib/game-queries'
import { declineInvite, myInvites } from '@/lib/invites'

/**
 * "Rədd et". The invited player turns an invite down; the host sees it as declined and can't ask
 * again. Accepting has no route of its own: joining the game is the answer (`POST /games/{id}/join`).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const inviteId = Number((await params).id)
    if (!Number.isSafeInteger(inviteId) || inviteId <= 0) return apiError('INVALID_INVITE_ID', 'Dəvət ID-si yanlışdır.', 400)

    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: request.headers })
    if (!user) return apiError('UNAUTHENTICATED', 'Bu əməliyyat üçün daxil olun.', 401)

    // The same 404 for someone else's invite and for one already answered, so ids can't be probed.
    if (!(await declineInvite(payload, inviteId, Number(user.id)))) return apiError('INVITE_NOT_FOUND', 'Cavab gözləyən belə dəvət yoxdur.', 404)
    return NextResponse.json({ invites: await myInvites(payload, Number(user.id)) })
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Dəvəti rədd etmək mümkün olmadı.', 500)
  }
}
