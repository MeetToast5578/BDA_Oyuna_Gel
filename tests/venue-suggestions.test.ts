import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { POST as suggestRoute } from '@/app/api/v1/venue-suggestions/route'
import { parseVenueSuggestion } from '@/lib/venue-suggestions'

describe('parseVenueSuggestion', () => {
  it('needs a name and a known sport, and trims the rest', () => {
    expect(parseVenueSuggestion({ name: '  Yeni Arena ', sports: ['football', 'chess', 'football'], district: ' Nəsimi ', note: '' })).toEqual({
      name: 'Yeni Arena',
      district: 'Nəsimi',
      address: null,
      sports: ['football'],
      note: null,
    })
    expect(parseVenueSuggestion({ name: 'A', sports: ['football'] })).toBeNull()
    expect(parseVenueSuggestion({ name: 'Arena', sports: ['chess'] })).toBeNull()
    expect(parseVenueSuggestion({ name: 'Arena', sports: 'football' })).toBeNull()
    expect(parseVenueSuggestion(null)).toBeNull()
  })
})

/** "Meydança təklif et": signed in, five a day, and only admins read what came in. */
describe.skipIf(!process.env.DATABASE_URL)('venue suggestions (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let userId: number
  let token = ''
  const post = async (body: unknown, signedIn = true) =>
    (await suggestRoute(
      new Request('http://localhost/api/v1/venue-suggestions', {
        method: 'POST',
        headers: { ...(signedIn ? { Cookie: `payload-token=${token}` } : {}), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    )) as Response

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    payload = await getPayload({ config: (await import('@/payload.config')).default })
    const email = `suggest-${suffix}@oyunagel.test`
    userId = (await payload.create({ collection: 'users', overrideAccess: true, data: { email, password: 'suggest-test-password', fullName: 'Suggest' } })).id
    token = (await payload.login({ collection: 'users', data: { email, password: 'suggest-test-password' } })).token ?? ''
  })

  afterAll(async () => {
    if (!payload) return
    await payload.delete({ collection: 'venue-suggestions', where: { submittedBy: { equals: userId } }, overrideAccess: true })
    await payload.delete({ collection: 'users', where: { id: { equals: userId } }, overrideAccess: true })
    await payload.db.destroy?.()
  })

  it('saves a suggestion from a signed-in person, five a day, readable by admins only', async () => {
    expect((await post({ name: `Arena ${suffix}`, sports: ['football'] }, false)).status).toBe(401)
    expect((await post({ name: 'x', sports: [] })).status).toBe(400)

    // Five tries a day, the refused one above included.
    for (let i = 0; i < 4; i++) expect((await post({ name: `Arena ${suffix} ${i}`, sports: ['football'] })).status).toBe(201)
    expect((await post({ name: `Arena ${suffix} 5`, sports: ['football'] })).status).toBe(429)

    const saved = await payload.find({ collection: 'venue-suggestions', where: { submittedBy: { equals: userId } }, overrideAccess: true })
    expect(saved.totalDocs).toBe(4)
    expect(saved.docs[0]).toMatchObject({ status: 'pending', sports: ['football'] })

    const user = { ...(await payload.findByID({ collection: 'users', id: userId, overrideAccess: true })), collection: 'users' as const }
    await expect(payload.find({ collection: 'venue-suggestions', user, overrideAccess: false })).rejects.toThrow()
  })
})
