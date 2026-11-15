import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { POST as confirm } from '@/app/api/v1/games/[id]/result/confirm/route'
import { POST as report } from '@/app/api/v1/games/[id]/result/route'
import { getGameDetail } from '@/lib/game-queries'

const HOUR_MS = 60 * 60 * 1000

type Who = 'host' | 'mate' | 'opponent' | 'stranger' | 'admin'

/**
 * The score: the host reports it once the game is over, a player on the other side confirms or
 * disputes it, and a report nobody answers counts as confirmed after 48 hours. The route handlers
 * are called with real session cookies, against the database in DATABASE_URL. Every record it
 * creates is removed afterwards.
 */
describe.skipIf(!process.env.DATABASE_URL)('reporting and confirming a score (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let arenaId: number
  const userIds: Record<Who, number> = { host: 0, mate: 0, opponent: 0, stranger: 0, admin: 0 }
  const tokens: Record<Who, string> = { host: '', mate: '', opponent: '', stranger: '', admin: '' }
  const gameIds: number[] = []

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    const config = (await import('@/payload.config')).default
    payload = await getPayload({ config })

    for (const who of Object.keys(userIds) as Who[]) {
      const email = `result-${suffix}-${who}@oyunagel.test`
      const user = await payload.create({
        collection: 'users',
        overrideAccess: true,
        data: { email, password: 'result-test-password', fullName: `Result ${who}`, role: who === 'admin' ? 'admin' : 'user' },
      })
      userIds[who] = user.id
      tokens[who] = (await payload.login({ collection: 'users', data: { email, password: 'result-test-password' } })).token ?? ''
    }
    arenaId = (
      await payload.create({ collection: 'arenas', overrideAccess: true, data: { name: `Result Arena ${suffix}`, location: 'Bakı', city: 'baku' } })
    ).id
  })

  afterAll(async () => {
    if (!payload) return
    if (gameIds.length) {
      await payload.delete({ collection: 'game-participants', where: { game: { in: gameIds } }, overrideAccess: true })
      await payload.delete({ collection: 'games', where: { id: { in: gameIds } }, overrideAccess: true })
    }
    await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } }, overrideAccess: true })
    await payload.delete({ collection: 'users', where: { id: { in: Object.values(userIds) } }, overrideAccess: true })
    await payload.db.destroy?.()
  })

  /** A game with the host and a teammate on home and an opponent on away; over by default. */
  async function makeGame({ hoursFromNow = -72, status = 'scheduled' }: { hoursFromNow?: number; status?: 'scheduled' | 'cancelled' } = {}) {
    const game = await payload.create({
      collection: 'games',
      overrideAccess: true,
      data: {
        title: `Result Game ${suffix}`,
        sport: 'football',
        level: 'medium',
        arena: arenaId,
        host: userIds.host,
        scheduledAt: new Date(Date.now() + hoursFromNow * HOUR_MS).toISOString(),
        maxPlayers: 10,
        availablePlayers: 7,
        contactPhone: '+994501234567',
        status,
      },
    })
    gameIds.push(game.id)
    for (const [who, side] of [['host', 'home'], ['mate', 'home'], ['opponent', 'away']] as const) {
      await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: game.id, user: userIds[who], side } })
    }
    return game.id
  }

  const post = (handler: typeof report, path: string, gameId: number, as: Who | null, body: unknown) =>
    handler(
      new Request(`http://localhost/api/v1/games/${gameId}/${path}`, {
        method: 'POST',
        headers: { ...(as ? { Cookie: `payload-token=${tokens[as]}` } : {}), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: String(gameId) }) },
    ) as Promise<Response>

  const send = (gameId: number, as: Who | null, homeScore = 2, awayScore = 1) =>
    post(report, 'result', gameId, as, { homeScore, awayScore })
  const answer = (gameId: number, as: Who | null, action: unknown) => post(confirm as typeof report, 'result/confirm', gameId, as, { action })
  const stored = (gameId: number) => payload.findByID({ collection: 'games', id: gameId, depth: 0, overrideAccess: true })
  const code = async (response: Response) => (await response.json()).error.code

  it('lets the host report the score once the game is over', async () => {
    const gameId = await makeGame()
    const response = await send(gameId, 'host')
    expect(response.status).toBe(200)
    expect((await response.json()).game.result).toMatchObject({ homeScore: 2, awayScore: 1, status: 'reported' })
    const game = await stored(gameId)
    expect(game).toMatchObject({ homeScore: 2, awayScore: 1, resultStatus: 'reported' })
    expect(game.resultReportedAt).toBeTruthy()
  })

  it('refuses a score before the game is over, or for a cancelled game', async () => {
    for (const options of [{ hoursFromNow: 5 }, { hoursFromNow: -0.5 }, { status: 'cancelled' as const }]) {
      const response = await send(await makeGame(options), 'host')
      expect(response.status).toBe(409)
      expect(await code(response)).toBe('GAME_NOT_FINISHED')
    }
  })

  it('refuses a bad body, and anyone but the host', async () => {
    const gameId = await makeGame()
    for (const [homeScore, awayScore] of [[-1, 0], [301, 0], [1.5, 2], ['3', 1], [null, 1]]) {
      const response = await post(report, 'result', gameId, 'host', { homeScore, awayScore })
      expect(response.status).toBe(400)
      expect(await code(response)).toBe('INVALID_RESULT')
    }
    expect((await send(gameId, null)).status).toBe(401)
    expect((await send(gameId, 'opponent')).status).toBe(403)
    expect((await send(gameId, 'mate')).status).toBe(403)
    expect((await stored(gameId)).resultStatus).toBeFalsy()
  })

  it("won't let the host's teammate, a stranger or the host confirm", async () => {
    const gameId = await makeGame()
    await send(gameId, 'host')
    for (const who of ['mate', 'stranger', 'host'] as const) {
      const response = await answer(gameId, who, 'confirm')
      expect(response.status).toBe(403)
      expect(await code(response)).toBe('FORBIDDEN')
    }
    expect((await answer(gameId, null, 'confirm')).status).toBe(401)
    expect((await stored(gameId)).resultStatus).toBe('reported')
  })

  it('lets a player on the other side confirm, and then the score is final', async () => {
    const gameId = await makeGame()
    await send(gameId, 'host')
    const response = await answer(gameId, 'opponent', 'confirm')
    expect(response.status).toBe(200)
    expect((await response.json()).game.result.status).toBe('confirmed')
    expect(await stored(gameId)).toMatchObject({ resultStatus: 'confirmed', resultConfirmedBy: userIds.opponent })

    const again = await answer(gameId, 'opponent', 'confirm')
    expect(again.status).toBe(409)
    expect(await code(again)).toBe('NOTHING_TO_CONFIRM')
    const rewrite = await send(gameId, 'host', 9, 0)
    expect(rewrite.status).toBe(409)
    expect(await code(rewrite)).toBe('RESULT_LOCKED')
    expect(await stored(gameId)).toMatchObject({ homeScore: 2, awayScore: 1 })
  })

  it('sends a disputed score back to the host, who can report again', async () => {
    const gameId = await makeGame()
    expect(await code(await answer(gameId, 'opponent', 'confirm'))).toBe('NOTHING_TO_CONFIRM')
    await send(gameId, 'host')
    expect((await answer(gameId, 'opponent', 'dispute')).status).toBe(200)
    expect(await stored(gameId)).toMatchObject({ resultStatus: 'disputed', resultConfirmedBy: userIds.opponent })

    expect((await send(gameId, 'host', 3, 3)).status).toBe(200)
    // The new report starts over: nobody has confirmed it yet.
    expect(await stored(gameId)).toMatchObject({ homeScore: 3, awayScore: 3, resultStatus: 'reported', resultConfirmedBy: null })
  })

  it('refuses an unknown action', async () => {
    const gameId = await makeGame()
    await send(gameId, 'host')
    const response = await answer(gameId, 'opponent', 'maybe')
    expect(response.status).toBe(400)
    expect(await code(response)).toBe('INVALID_ACTION')
  })

  it('counts a report nobody answers as confirmed after 48 hours', async () => {
    const gameId = await makeGame()
    await send(gameId, 'host')
    expect((await getGameDetail(gameId, userIds.stranger))?.result?.status).toBe('reported')

    await payload.update({
      collection: 'games',
      id: gameId,
      overrideAccess: true,
      data: { resultReportedAt: new Date(Date.now() - 49 * HOUR_MS).toISOString() },
    })
    const detail = await getGameDetail(gameId, userIds.host)
    expect(detail?.result?.status).toBe('confirmed')
    expect(detail?.canReport).toBe(false)
    expect(await code(await send(gameId, 'host', 9, 0))).toBe('RESULT_LOCKED')
    expect(await code(await answer(gameId, 'opponent', 'dispute'))).toBe('NOTHING_TO_CONFIRM')
  })

  it("tells each viewer what they can do, so the page doesn't re-derive the rules", async () => {
    const gameId = await makeGame()
    const view = async (who: Who | null) => {
      const detail = await getGameDetail(gameId, who ? userIds[who] : null)
      return { canReport: detail?.canReport, canConfirm: detail?.canConfirm, result: detail?.result }
    }
    expect(await view('host')).toEqual({ canReport: true, canConfirm: false, result: null })
    expect(await view('opponent')).toEqual({ canReport: false, canConfirm: false, result: null })

    await send(gameId, 'host')
    expect(await view('host')).toMatchObject({ canReport: true, canConfirm: false })
    expect(await view('opponent')).toMatchObject({ canReport: false, canConfirm: true })
    expect(await view('mate')).toMatchObject({ canReport: false, canConfirm: false })
    expect(await view('stranger')).toMatchObject({ canReport: false, canConfirm: false })
    expect(await view(null)).toMatchObject({ canReport: false, canConfirm: false, result: { homeScore: 2, awayScore: 1, status: 'reported' } })

    await answer(gameId, 'opponent', 'confirm')
    expect(await view('host')).toMatchObject({ canReport: false, canConfirm: false })
    expect(await view('opponent')).toMatchObject({ canConfirm: false })
    // Where each viewer stood, for the page's "Siz qalib gəldiniz": the host's side, the rival's, nobody's.
    const side = async (who: Who | null) => (await getGameDetail(gameId, who ? userIds[who] : null))?.viewer.side
    expect([await side('host'), await side('opponent'), await side('stranger'), await side(null)]).toEqual(['home', 'away', null, null])
  })

  it('shows the group chat link only to the host and players who joined', async () => {
    const gameId = await makeGame()
    await payload.update({ collection: 'games', id: gameId, data: { groupLink: 'https://chat.whatsapp.com/AbCdEf123456' }, overrideAccess: true })
    const link = async (who: Who | null) => (await getGameDetail(gameId, who ? userIds[who] : null))?.groupLink
    expect([await link('host'), await link('opponent'), await link('stranger'), await link(null)]).toEqual([
      'https://chat.whatsapp.com/AbCdEf123456',
      'https://chat.whatsapp.com/AbCdEf123456',
      null,
      null,
    ])
  })

  it('does not offer a score on a game that is not over', async () => {
    const detail = await getGameDetail(await makeGame({ hoursFromNow: 5 }), userIds.host)
    expect(detail).toMatchObject({ canReport: false, canConfirm: false, result: null })
  })

  it('lets an admin settle a score, which needs no confirmation', async () => {
    const gameId = await makeGame()
    await send(gameId, 'host')
    const response = await send(gameId, 'admin', 4, 4)
    expect(response.status).toBe(200)
    expect(await stored(gameId)).toMatchObject({ homeScore: 4, awayScore: 4, resultStatus: 'confirmed' })
  })
})
