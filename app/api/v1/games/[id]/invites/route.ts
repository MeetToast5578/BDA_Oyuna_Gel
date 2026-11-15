import { unstable_rethrow } from 'next/navigation'
import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { authorizeHost } from '@/lib/authorize-host'
import { getGameDetail, getPayloadClient } from '@/lib/game-queries'
import { INVITE_ERRORS, inviteToGame, listGameInvites } from '@/lib/invites'
import { afterResponse, notifyInvited } from '@/lib/notify'
import { parseInviteRequest } from '@/lib/team-logic'

/** The game's invitations that are open or were turned down, for the host. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeHost(request, (await params).id)
    if ('error' in auth) return auth.error
    return NextResponse.json({ invites: await listGameInvites(await getPayloadClient(), auth.gameId) })
  } catch (error) {
    // Reading the headers bails out of prerendering by throwing; that belongs to Next, not this log.
    unstable_rethrow(error)
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Dəvətləri yükləmək mümkün olmadı.', 500)
  }
}

/**
 * "Dəvət et". The host (or an admin) invites one player to a side, `{ userId, side }`, several at once,
 * `{ invites: [{ userId, side }] }`, or everyone in a side's club, `{ clubSide }`, before kick-off. An invite holds no spot: the player takes one by
 * joining. Answers with the game's invitations, as `GET` does.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeHost(request, (await params).id)
    if ('error' in auth) return auth.error

    const body = parseInviteRequest(await request.json().catch(() => null))
    if (!body.ok) return apiError('INVALID_INVITE', 'Dəvət sorğusu yanlışdır.', 400)

    const payload = await getPayloadClient()
    const result = await inviteToGame(payload, auth.gameId, auth.userId, body.club ? { club: true, side: body.side } : { club: false, entries: body.entries })
    if (!result.ok) {
      const { status, message } = INVITE_ERRORS[result.code]
      // Several can be invited at once, so say whom a refusal is about.
      const who = result.userId === undefined ? null : await payload.findByID({ collection: 'users', id: result.userId, select: { fullName: true }, depth: 0, overrideAccess: true, disableErrors: true })
      return apiError(result.code, who?.fullName ? `${message} (${who.fullName})` : message, status)
    }

    if (result.invited.length > 0) {
      const entries = body.club ? result.invited.map((userId) => ({ userId, side: body.side })) : body.entries
      const game = await getGameDetail(auth.gameId, auth.userId)
      if (game) afterResponse(() => notifyInvited(payload, { ...game, hostName: game.host.name }, entries))
    }
    return NextResponse.json({ invited: result.invited.length, invites: await listGameInvites(payload, auth.gameId) })
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Dəvət göndərmək mümkün olmadı.', 500)
  }
}
