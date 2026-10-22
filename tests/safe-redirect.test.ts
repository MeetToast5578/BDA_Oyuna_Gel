import { describe, expect, it } from 'vitest'

import { safeRedirectPath } from '@/lib/safe-redirect'

describe('safeRedirectPath', () => {
  it('keeps same-site paths with their query and hash', () => {
    expect(safeRedirectPath('/games/12')).toBe('/games/12')
    expect(safeRedirectPath('/profile?games=hosting#x')).toBe('/profile?games=hosting#x')
  })

  it('refuses anything a browser would send to another site', () => {
    for (const next of ['//evil.com', '/\\evil.com', '/\t/evil.com', '/\n/evil.com', '/\r\\evil.com', 'https://evil.com', 'evil.com']) {
      expect(safeRedirectPath(next)).toBe('/')
    }
  })

  it('falls back for non-strings', () => {
    expect(safeRedirectPath(undefined, '/games')).toBe('/games')
    expect(safeRedirectPath(['/games'])).toBe('/')
  })
})
