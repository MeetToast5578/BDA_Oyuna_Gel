import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyticsPath, sportValue } from '@/lib/analytics'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules() })

describe('analytics privacy boundaries', () => {
  it('stays disabled without a measurement ID even with consent', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', '')
    vi.stubGlobal('document', { cookie: 'oyuna_analytics_consent=granted' })
    vi.stubGlobal('window', {})
    const analytics = await import('@/lib/analytics')
    analytics.initialiseAnalytics('/about')
    expect(analytics.MEASUREMENT_ID).toBe('')
    expect(window.gtag).toBeUndefined()
  })
  it('removes private IDs, invite codes, search text and hashes', () => {
    expect(analyticsPath('/teams/join/private-invite?email=private#phone')).toBe('/teams/join/:code')
    expect(analyticsPath('/games/123/edit?phone=private')).toBe('/games/:id/edit')
    expect(analyticsPath('/users/456')).toBe('/users/:id')
    expect(analyticsPath('/games/new')).toBe('/games/new')
    expect(analyticsPath('/games/past')).toBe('/games/past')
    expect(analyticsPath('/venues/suggest')).toBe('/venues/suggest')
    expect(analyticsPath('/unexpected/private')).toBe('/other')
    expect(sportValue('private search')).toBe('all')
  })

  it('never initialises or queues tracking without consent', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123')
    vi.stubGlobal('window', { location: { origin: 'https://oyunagel.az' } })
    vi.stubGlobal('document', { cookie: '' })
    const analytics = await import('@/lib/analytics')
    analytics.initialiseAnalytics('/about')
    analytics.trackPage('/about')
    analytics.trackAction('game_joined', 'football')
    expect(window.gtag).toBeUndefined()
    expect(window.dataLayer).toBeUndefined()
  })

  it('queues one explicit view and only allowed action parameters after consent', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123')
    vi.stubGlobal('window', { location: { origin: 'https://oyunagel.az' } })
    vi.stubGlobal('document', { cookie: 'oyuna_analytics_consent=granted' })
    const analytics = await import('@/lib/analytics')
    analytics.initialiseAnalytics('/teams/join/secret?name=private')
    analytics.trackPage('/teams/join/secret?name=private')
    analytics.trackAction('game_created', 'football')
    const commands = window.dataLayer!.map((entry) => Array.from(entry as ArrayLike<unknown>))
    expect(commands.filter((entry) => entry[1] === 'page_view')).toHaveLength(1)
    expect(commands.find((entry) => entry[0] === 'config')?.[2]).toMatchObject({ send_page_view: false, page_referrer: '', allow_google_signals: false })
    expect(commands.at(-1)).toEqual(['event', 'game_created', { sport: 'football' }])
    expect(JSON.stringify(commands)).not.toMatch(/secret|private/)
    document.cookie = 'oyuna_analytics_consent=denied'
    analytics.trackAction('game_joined', 'tennis')
    expect(window.dataLayer).toHaveLength(commands.length)
  })

  it('keeps successful application actions successful when analytics throws', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123')
    vi.stubGlobal('document', { cookie: 'oyuna_analytics_consent=granted' })
    vi.stubGlobal('window', { gtag: () => { throw new Error('blocked') } })
    const { trackAction } = await import('@/lib/analytics')
    expect(() => trackAction('waitlist_joined', 'tennis')).not.toThrow()
  })
})
