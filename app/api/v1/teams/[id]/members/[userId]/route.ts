import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { parseId, requireUser, teamError } from '@/lib/team-routes'
import { removeMember } from '@/lib/teams'

/** "Üzvü çıxar": the captain removes a member. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const { id, userId } = await params
    const teamId = parseId(id)
    const memberId = parseId(userId)
    if (teamId === null || memberId === null) return apiError('INVALID_TEAM_ID', 'Komanda və ya istifadəçi ID-si yanlışdır.', 400)
    const auth = await requireUser(request)
    if ('error' in auth) return auth.error

    const result = await removeMember(auth.payload, teamId, auth.userId, memberId)
    return result.ok ? NextResponse.json({ ok: true }) : teamError(result.code)
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Üzvü çıxarmaq mümkün olmadı.', 500)
  }
}
