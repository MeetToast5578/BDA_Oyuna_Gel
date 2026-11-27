import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ tasks: [] as Array<() => Promise<unknown>> }))
vi.mock('@/lib/notify', () => ({ afterResponse: (task: () => Promise<unknown>) => { mocks.tasks.push(task) } }))

import { newGamePost, scheduleTelegramPost } from '@/lib/telegram'

const game = {
  id: '42',
  title: 'Axşam futbolu',
  sportLabel: 'Futbol',
  levelLabel: 'Orta',
  dateLabel: 'Cüm, 28 Noy',
  timeLabel: '20:00',
  venue: { label: 'Aku Arena — Nizami, Bakı' },
  remainingSpots: 3,
  // Private fields the real game object also carries; they must never be posted.
  host: { phone: '+994501234567' },
  groupLink: 'https://chat.whatsapp.com/secret',
} as unknown as Parameters<typeof newGamePost>[0]

const fetchMock = vi.fn()
beforeEach(() => {
  mocks.tasks.length = 0
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200 })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '123:secret-token')
  vi.stubEnv('TELEGRAM_CHANNEL_ID', '@oyunagel_test')
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Telegram new-game posts', () => {
  it('builds the post from public fields only', () => {
    const text = newGamePost(game)
    expect(text).toContain('Yeni oyun: Axşam futbolu')
    expect(text).toContain('Futbol · Orta')
    expect(text).toContain('Aku Arena — Nizami, Bakı')
    expect(text).toContain('3 yer qalıb')
    expect(text).toMatch(/\/games\/42$/)
    expect(text).not.toMatch(/994501234567|chat\.whatsapp|secret/)
  })

  it('sends one message to the configured channel after the response', async () => {
    scheduleTelegramPost(game)
    expect(fetchMock).not.toHaveBeenCalled()
    await mocks.tasks[0]()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.telegram.org/bot123:secret-token/sendMessage')
    expect(JSON.parse(init.body)).toEqual({ chat_id: '@oyunagel_test', text: newGamePost(game) })
  })

  it('stays off without config, on a Preview, and for demo games', () => {
    for (const [key, value] of [['TELEGRAM_BOT_TOKEN', ''], ['TELEGRAM_CHANNEL_ID', ''], ['VERCEL_ENV', 'preview']] as const) {
      vi.stubEnv(key, value)
      scheduleTelegramPost(game)
      vi.unstubAllEnvs()
      vi.stubEnv('TELEGRAM_BOT_TOKEN', '123:secret-token')
      vi.stubEnv('TELEGRAM_CHANNEL_ID', '@oyunagel_test')
    }
    scheduleTelegramPost({ ...game, isDemo: true })
    expect(mocks.tasks).toHaveLength(0)
  })

  it('logs a failure without the token and never throws', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 })
    scheduleTelegramPost(game)
    await expect(mocks.tasks[0]()).resolves.toBe('failed')
    fetchMock.mockRejectedValue(new Error('network down for bot123:secret-token'))
    scheduleTelegramPost(game)
    await expect(mocks.tasks[1]()).resolves.toBe('failed')
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('secret-token')
  })
})
