import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { parseId, requireUser, teamError } from '@/lib/team-routes'
import { parseJoinTeamBody } from '@/lib/team-logic'
import { getTeam, joinTeam } from '@/lib/teams'

/** "Komandaya qoş": `{ code }` from the invite link. Joining a club you are already in does nothing. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const teamId = parseId((await params).id)
    if (teamId === null) return apiError('INVALID_TEAM_ID', 'Komanda ID-si yanlışdır.', 400)
    const auth = await requireUser(request)
    if ('error' in auth) return auth.error

    const body = parseJoinTeamBody(await request.json().catch(() => null))
    if (!body.ok) return apiError('INVALID_INVITE', 'Dəvət linki yanlışdır və ya köhnəlib.', 403)

    const result = await joinTeam(auth.payload, teamId, auth.userId, body.code)
    if (!result.ok) return teamError(result.code)
    return NextResponse.json({ joined: result.joined, team: await getTeam(auth.payload, teamId, auth.userId) })
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Komandaya qoşulmaq mümkün olmadı.', 500)
  }
}
