import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { parseId, requireUser, teamError } from '@/lib/team-routes'
import { leaveTeam } from '@/lib/teams'

/** "Komandadan çıx". A leaving captain hands over to the longest-standing member. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const teamId = parseId((await params).id)
    if (teamId === null) return apiError('INVALID_TEAM_ID', 'Komanda ID-si yanlışdır.', 400)
    const auth = await requireUser(request)
    if ('error' in auth) return auth.error

    const result = await leaveTeam(auth.payload, teamId, auth.userId)
    return result.ok ? NextResponse.json({ ok: true }) : teamError(result.code)
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Komandadan çıxmaq mümkün olmadı.', 500)
  }
}
