import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

// The venue list is a 'use cache' function; outside Next its cache calls are no-ops.
vi.mock('next/cache', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/cache')>()), cacheLife: () => {}, cacheTag: () => {}, revalidateTag: () => {} }))

import { listVenuePages, listVenues } from '@/lib/game-queries'

/** Partner venues: their fields, validation and place at the top of every list. */
describe.skipIf(!process.env.DATABASE_URL)('partner venues (Postgres)', () => {
  const suffix = `pv${Date.now()}`
  let payload: Payload
  const arenaIds: number[] = []
  const arena = async (data: Record<string, unknown>) => {
    const doc = await payload.create({ collection: 'arenas', overrideAccess: true, data: { location: 'Bakı', city: 'baku', ...data } as never })
    arenaIds.push(doc.id)
    return doc
  }

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    payload = await getPayload({ config: (await import('@/payload.config')).default })
  })

  afterAll(async () => {
    if (!payload) return
    await payload.delete({ collection: 'arenas', where: { id: { in: arenaIds } }, overrideAccess: true })
    await payload.db.destroy?.()
  })

  it('lists partner venues first, then by name, with their contact details', async () => {
    await arena({ name: `AA Plain ${suffix}` })
    const partner = await arena({
      name: `ZZ Partner ${suffix}`, partner: true, phone: '050 123 45 67', bookingUrl: 'https://book.example.az/zz', priceNote: '40–60 ₼/saat', hours: '09:00–24:00',
    })
    expect(partner.phone).toBe('+994501234567')

    const names = (await listVenues('baku', null, suffix)).map((venue) => venue.name)
    expect(names).toEqual([`ZZ Partner ${suffix}`, `AA Plain ${suffix}`])

    const page = (await listVenuePages('baku')).find((venue) => venue.id === String(partner.id))
    expect(page).toMatchObject({ partner: true, phone: '+994501234567', bookingUrl: 'https://book.example.az/zz', priceNote: '40–60 ₼/saat', hours: '09:00–24:00' })
  })

  it('refuses a phone that is not Azerbaijani and a booking link that is not https', async () => {
    await expect(arena({ name: `Bad phone ${suffix}`, phone: '12345' })).rejects.toThrow()
    await expect(arena({ name: `Bad link ${suffix}`, bookingUrl: 'http://book.example.az' })).rejects.toThrow()
  })
})
