import { apiError } from '@/lib/api-response'
import { getPayloadClient } from '@/lib/game-queries'
import type { TeamErrorCode } from '@/lib/teams'

/** HTTP status and Azerbaijani message of each refusal of the club routes. */
export const TEAM_ERRORS: Record<TeamErrorCode, { status: number; message: string }> = {
  TEAM_NOT_FOUND: { status: 404, message: 'Komanda tapılmadı.' },
  NOT_CAPTAIN: { status: 403, message: 'Bunu yalnız komandanın kapitanı edə bilər.' },
  INVALID_INVITE: { status: 403, message: 'Dəvət linki yanlışdır və ya köhnəlib.' },
  NOT_A_CLUB_MEMBER: { status: 409, message: 'Bu istifadəçi komandanın üzvü deyil.' },
  TOO_MANY_CLUBS: { status: 409, message: 'Ən çox 5 komandaya kapitanlıq edə bilərsiniz.' },
}

export const teamError = (code: TeamErrorCode) => apiError(code, TEAM_ERRORS[code].message, TEAM_ERRORS[code].status)

/** A positive integer id from a URL segment, or null. */
export function parseId(raw: string) {
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

/** The signed-in user of a request, or the 401 to answer with. */
export async function requireUser(request: Request) {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: request.headers })
  if (!user) return { error: apiError('UNAUTHENTICATED', 'Bu əməliyyat üçün daxil olun.', 401) } as const
  return { payload, userId: Number(user.id) } as const
}
