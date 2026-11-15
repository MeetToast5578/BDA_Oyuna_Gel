import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { authorizeHost } from '@/lib/authorize-host'
import { getPayloadClient } from '@/lib/game-queries'
import { cancelInvite, listGameInvites } from '@/lib/invites'

/** "Dəvəti geri götür". The host takes back an invite nobody has answered yet. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; inviteId: string }> }) {
  try {
    const { id, inviteId: rawInvite } = await params
    const auth = await authorizeHost(request, id)
    if ('error' in auth) return auth.error

    const inviteId = Number(rawInvite)
    if (!Number.isSafeInteger(inviteId) || inviteId <= 0) return apiError('INVALID_INVITE_ID', 'Dəvət ID-si yanlışdır.', 400)

    const payload = await getPayloadClient()
    if (!(await cancelInvite(payload, auth.gameId, inviteId))) return apiError('INVITE_NOT_FOUND', 'Cavab gözləyən belə dəvət yoxdur.', 404)
    return NextResponse.json({ invites: await listGameInvites(payload, auth.gameId) })
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Dəvəti geri götürmək mümkün olmadı.', 500)
  }
}
