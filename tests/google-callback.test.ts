import { describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/auth/google/callback/route'

// The route only needs a database once the Google profile has been read; none of these cases get there.
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: vi.fn(async () => { throw new Error('database down') }) }))

const call = (url: string, cookie?: string) =>
  GET(new Request(url, { headers: cookie ? { cookie, host: 'www.oyunagel.az', 'x-forwarded-proto': 'https' } : { host: 'www.oyunagel.az', 'x-forwarded-proto': 'https' } }))

describe('Google callback failures', () => {
  it('sends a missing or mismatched sign-in state back to /login, not a JSON error', async () => {
    for (const response of [
      await call('https://www.oyunagel.az/api/auth/google/callback'),
      await call('https://www.oyunagel.az/api/auth/google/callback?code=c&state=a', 'google_oauth_state=b'),
    ]) {
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('https://www.oyunagel.az/login?error=google')
    }
  })

  it('turns a crash while signing in into the same redirect', async () => {
    vi.stubEnv('PAYLOAD_SECRET', 'test-secret')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    const response = await call('https://www.oyunagel.az/api/auth/google/callback?code=c&state=s', 'google_oauth_state=s')
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://www.oyunagel.az/login?error=google')
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })
})
