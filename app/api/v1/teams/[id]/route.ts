import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { getPayloadClient } from '@/lib/game-queries'
import { parseId, requireUser, teamError } from '@/lib/team-routes'
import { parseUpdateTeamBody } from '@/lib/team-logic'
import { getTeam, updateTeam } from '@/lib/teams'

/** A club's page data. Public; signing in marks your own row and, for the captain, adds the invite code. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const teamId = parseId((await params).id)
  if (teamId === null) return apiError('INVALID_TEAM_ID', 'Komanda ID-si yanlışdır.', 400)

  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: request.headers })
    const team = await getTeam(payload, teamId, user ? Number(user.id) : null)
    return team ? NextResponse.json(team) : teamError('TEAM_NOT_FOUND')
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Komandanı yükləmək mümkün olmadı.', 500)
  }
}

/** Captain only: rename the club (`name`), or retire its invite link for a new one (`regenerateInviteCode: true`). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const teamId = parseId((await params).id)
    if (teamId === null) return apiError('INVALID_TEAM_ID', 'Komanda ID-si yanlışdır.', 400)
    const auth = await requireUser(request)
    if ('error' in auth) return auth.error

    const body = parseUpdateTeamBody(await request.json().catch(() => null))
    if (!body.ok) {
      return apiError(body.code, body.code === 'INVALID_NAME' ? 'Komanda adı 2 ilə 40 simvol arasında olmalıdır.' : 'Dəyişiklik sorğusu yanlışdır.', 400)
    }

    const result = await updateTeam(auth.payload, teamId, auth.userId, body)
    if (!result.ok) return teamError(result.code)
    return NextResponse.json(await getTeam(auth.payload, teamId, auth.userId))
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Komandanı yeniləmək mümkün olmadı.', 500)
  }
}
