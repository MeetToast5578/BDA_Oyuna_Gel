import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { clientIp, isRateLimited, rateLimitedResponse } from '@/lib/rate-limit'
import { requireUser } from '@/lib/team-routes'
import { parseVenueSuggestion } from '@/lib/venue-suggestions'

/** "Meydança təklif et": signed in, five a day; an admin reviews it in the admin panel. */
export async function POST(request: Request) {
  try {
    const auth = await requireUser(request)
    if ('error' in auth) return auth.error
    if (await isRateLimited(auth.payload, 'suggestVenue', { userId: auth.userId, ip: clientIp(request) })) return rateLimitedResponse()

    const suggestion = parseVenueSuggestion(await request.json().catch(() => null))
    if (!suggestion) return apiError('INVALID_SUGGESTION', 'Meydançanın adını (2–80 simvol) yazın və ən azı bir idman növü seçin.', 400)

    await auth.payload.create({
      collection: 'venue-suggestions',
      data: { ...suggestion, sports: suggestion.sports as ('football' | 'basketball' | 'tennis')[], submittedBy: auth.userId, status: 'pending' },
      overrideAccess: true,
    })
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Təklifi göndərmək mümkün olmadı.', 500)
  }
}
