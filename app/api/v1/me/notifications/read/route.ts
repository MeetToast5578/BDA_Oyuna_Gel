import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { markNotificationsRead } from '@/lib/notifications'
import { requireUser } from '@/lib/team-routes'

/** Marks every notice of the signed-in person seen; `/notifications` calls it when opened. */
export async function POST(request: Request) {
  try {
    const auth = await requireUser(request)
    if ('error' in auth) return auth.error
    await markNotificationsRead(auth.payload, auth.userId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Bildirişləri yeniləmək mümkün olmadı.', 500)
  }
}
