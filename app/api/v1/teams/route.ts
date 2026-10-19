import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { SPORTS } from '@/lib/game-backend'
import { getPayloadClient } from '@/lib/game-queries'
import { requireUser, teamError } from '@/lib/team-routes'
import { parseCreateTeamBody } from '@/lib/team-logic'
import { byStanding, createTeam, listTeams } from '@/lib/teams'

const CREATE_ERRORS = {
  INVALID_NAME: 'Komanda adı 2 ilə 40 simvol arasında olmalıdır.',
  INVALID_SPORT: 'İdman növü yanlışdır.',
}

/**
 * "Komandalar": the clubs with members, biggest first, each with its record. Public. `?sport=` narrows
 * it, and then `standings` is the same clubs as a league table (points, goal difference, goals scored);
 * all sports together have no table.
 */
export async function GET(request: Request) {
  const sport = new URL(request.url).searchParams.get('sport')
  if (sport !== null && !SPORTS.includes(sport)) return apiError('INVALID_SPORT', CREATE_ERRORS.INVALID_SPORT, 400)

  try {
    const teams = await listTeams(await getPayloadClient(), sport)
    const standings = sport ? [...teams].sort(byStanding) : undefined
    return NextResponse.json({ teams, standings })
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Komandaları yükləmək mümkün olmadı.', 500)
  }
}

/** "Komanda yarat". The creator becomes its captain and first member. */
export async function POST(request: Request) {
  try {
    const auth = await requireUser(request)
    if ('error' in auth) return auth.error

    const body = parseCreateTeamBody(await request.json().catch(() => null))
    if (!body.ok) return apiError(body.code, CREATE_ERRORS[body.code], 400)

    const result = await createTeam(auth.payload, auth.userId, body)
    return result.ok ? NextResponse.json({ id: String(result.id) }, { status: 201 }) : teamError(result.code)
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Komandanı yaratmaq mümkün olmadı.', 500)
  }
}
