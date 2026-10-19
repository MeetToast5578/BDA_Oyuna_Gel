import type { Payload } from 'payload'

import { promotedEmail } from '@/lib/emails'
import { getGameDetail } from '@/lib/game-queries'
import { notify } from '@/lib/notify'

/** Games where waiting players just got a spot, and who they are. */
export type Promotions = { gameId: number; userIds: number[] }[]

/** Tells each person who came off a waitlist that they are in. Never throws, like every email. */
export async function notifyPromoted(payload: Payload, promotions: Promotions) {
  for (const { gameId, userIds } of promotions) {
    if (userIds.length === 0) continue
    try {
      const game = await getGameDetail(gameId, null)
      if (game) await notify(payload, userIds, promotedEmail(game))
    } catch (error) {
      console.error('Failed to tell promoted players', error)
    }
  }
}
