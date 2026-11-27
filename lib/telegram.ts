import type { GameDetail } from '@/lib/api-types'
import { afterResponse } from '@/lib/notify'
import { SITE_URL } from '@/lib/site-url'

type PostableGame = Pick<GameDetail, 'id' | 'title' | 'sportLabel' | 'levelLabel' | 'dateLabel' | 'timeLabel' | 'venue' | 'remainingSpots'> & {
  isDemo?: boolean
}

/** Bot token and channel from the environment; null (off) when either is missing, and always off on a Preview. */
export function telegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId = process.env.TELEGRAM_CHANNEL_ID?.trim()
  if (!token || !chatId || process.env.VERCEL_ENV === 'preview') return null
  return { token, chatId }
}

/**
 * The channel post for a new game. Built from picked public fields only: the game object also carries
 * the host's phone and the private group link, which must never reach a public channel.
 */
export function newGamePost(game: PostableGame) {
  return [
    `Yeni oyun: ${game.title}`,
    `${game.sportLabel} · ${game.levelLabel}`,
    `${game.dateLabel} · ${game.timeLabel}`,
    game.venue.label,
    `${game.remainingSpots} yer qalıb`,
    `${SITE_URL}/games/${encodeURIComponent(game.id)}`,
  ].join('\n')
}

/** Sends one post; 'disabled' without config, 'failed' on any error (logged without the token). */
export async function sendTelegramPost(text: string): Promise<'disabled' | 'sent' | 'failed'> {
  const config = telegramConfig()
  if (!config) return 'disabled'
  try {
    const response = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chatId, text }),
      signal: AbortSignal.timeout(5000),
    })
    if (response.ok) return 'sent'
    console.error('telegram_post', { status: response.status })
  } catch {
    console.error('telegram_post', { status: 'network' })
  }
  return 'failed'
}

/** After the response: post a newly created real game to the channel. Best effort, no retry. */
export function scheduleTelegramPost(game: PostableGame) {
  if (game.isDemo || !telegramConfig()) return
  const text = newGamePost(game)
  afterResponse(() => sendTelegramPost(text))
}
