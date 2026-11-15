import { unstable_rethrow } from 'next/navigation'
import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { getPayloadClient } from '@/lib/game-queries'
import { myInvites } from '@/lib/invites'

/** The invitations waiting for the signed-in player, soonest game first. */
export async function GET(request: Request) {
  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: request.headers })
    if (!user) return apiError('UNAUTHENTICATED', 'Dəvətlərə baxmaq üçün daxil olun.', 401)
    return NextResponse.json({ invites: await myInvites(payload, Number(user.id)) })
  } catch (error) {
    // Reading the headers bails out of prerendering by throwing; that belongs to Next, not this log.
    unstable_rethrow(error)
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Dəvətləri yükləmək mümkün olmadı.', 500)
  }
}
