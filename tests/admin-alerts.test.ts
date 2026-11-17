import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

const mocks = vi.hoisted(() => ({ send: vi.fn(), adapter: vi.fn(), tasks: [] as Array<() => Promise<unknown>> }))
vi.mock('@payloadcms/email-nodemailer', () => ({ nodemailerAdapter: mocks.adapter }))
vi.mock('@/lib/notify', () => ({ afterResponse: (task: () => Promise<unknown>) => { mocks.tasks.push(task) } }))

import { adminAlertEmail, scheduleAdminAlert, sendAdminAlert, type AdminEvent } from '@/lib/admin-alerts'
import { findOrCreateGoogleUser } from '@/lib/google-oauth'

const event: AdminEvent = { type: 'player_joined', actorId: 12, actorName: 'Test Player', game: { id: 34, title: 'Axşam futbolu' } }
const payload = { findByID: vi.fn() } as unknown as Payload
beforeEach(() => {
  vi.clearAllMocks(); mocks.tasks.length = 0
  vi.stubEnv('ADMIN_EMAIL_ENABLED', 'true')
  vi.stubEnv('ADMIN_GMAIL_USER', 'oyunagel465@gmail.com')
  vi.stubEnv('ADMIN_GMAIL_APP_PASSWORD', 'test app password')
  vi.stubEnv('ADMIN_ALERT_EMAIL', '')
  vi.stubEnv('VERCEL_ENV', 'production')
  mocks.adapter.mockResolvedValue(() => ({ sendEmail: mocks.send }))
  mocks.send.mockResolvedValue({ accepted: ['oyunagel465@gmail.com'] })
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('admin email delivery', () => {
  it('does not schedule SMTP unless explicitly enabled and configured, and never in Preview', async () => {
    for (const [key, value] of [['ADMIN_EMAIL_ENABLED', 'false'], ['ADMIN_GMAIL_APP_PASSWORD', ''], ['ADMIN_GMAIL_USER', 'not-an-email'], ['ADMIN_ALERT_EMAIL', 'one@test.com\r\nBcc:two@test.com'], ['VERCEL_ENV', 'preview']] as const) {
      const before = process.env[key]
      vi.stubEnv(key, value)
      scheduleAdminAlert(payload, event)
      expect(await sendAdminAlert(payload, event)).toBe('disabled')
      vi.stubEnv(key, before)
    }
    expect(mocks.tasks).toHaveLength(0)
    expect(mocks.adapter).not.toHaveBeenCalled()
  })

  it('runs after the response and sends only to the central inbox using an isolated TLS sender', async () => {
    scheduleAdminAlert(payload, event)
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.tasks).toHaveLength(1)
    await mocks.tasks[0]()
    expect(mocks.adapter).toHaveBeenCalledWith(expect.objectContaining({
      defaultFromAddress: 'oyunagel465@gmail.com', skipVerify: true,
      transportOptions: expect.objectContaining({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: 'oyunagel465@gmail.com', pass: 'testapppassword' } }),
    }))
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'oyunagel465@gmail.com', subject: '[OyunaGəl admin] Oyunçu oyuna qoşuldu' }))
    expect(mocks.send.mock.calls[0][0].html).toContain('/games/34')
    expect(payload.findByID).not.toHaveBeenCalled()
  })

  it('escapes user text, uses fixed subjects and omits private form data', () => {
    const game = { id: 34, title: '<img src=x onerror=evil()>', contactPhone: 'private-phone', groupLink: 'private-group' }
    const email = adminAlertEmail({ ...event, game }, '<script>name</script>\r\nBcc: fake@test.com', new Date('2026-11-17T12:00:00Z'))
    expect(email.subject).not.toMatch(/<|\r|\n|Bcc/)
    expect(email.html).toContain('&lt;script&gt;')
    expect(email.html).toContain('&lt;img')
    expect(email.html).not.toContain('<script>')
    expect(email.text + email.html).not.toMatch(/private-phone|private-group|testapppassword/)
    expect(email.text).toContain('16:00') // Baku UTC+4
  })

  it('links deleted games to the list and never sends a broken game detail link', () => {
    const email = adminAlertEmail({ ...event, type: 'game_deleted' }, 'Test', new Date())
    expect(email.html).toContain('/games')
    expect(email.html).not.toContain('/games/34')
  })

  it('does not throw or log raw SMTP credentials/errors when sending fails', async () => {
    mocks.send.mockRejectedValue(new Error('sensitive SMTP auth response with password'))
    expect(await sendAdminAlert(payload, event)).toBe('failed')
    expect(console.error).toHaveBeenCalledWith('admin_email', { event: 'player_joined', status: 'failed' })
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('password')
    scheduleAdminAlert(async () => { throw new Error('database lookup failed') }, event)
    await expect(mocks.tasks[0]()).resolves.toBeUndefined()
  })
})

describe('registration alerts', () => {
  it('schedules a new account alert once, but not on repeat sign-in', async () => {
    const created = { id: 77, fullName: 'New Player', googleId: 'google-77' }
    const db = { find: vi.fn().mockResolvedValue({ docs: [] }), create: vi.fn().mockResolvedValue(created), update: vi.fn().mockResolvedValue(created) } as unknown as Payload
    const profile = { sub: 'google-77', email: 'new@test.com', name: 'New Player' }
    expect(await findOrCreateGoogleUser(db, profile)).toEqual(created)
    expect(mocks.tasks).toHaveLength(1)
    vi.mocked(db.find).mockResolvedValue({ docs: [created] } as never)
    await findOrCreateGoogleUser(db, profile)
    expect(mocks.tasks).toHaveLength(1)
    expect(db.create).toHaveBeenCalledTimes(1)
  })

  it('does not alert for rejected identities or failed account creation', async () => {
    const db = { find: vi.fn().mockResolvedValueOnce({ docs: [] }).mockResolvedValueOnce({ docs: [{ id: 1, googleId: 'someone-else' }] }), create: vi.fn() } as unknown as Payload
    expect(await findOrCreateGoogleUser(db, { sub: 'new', email: 'claimed@test.com' })).toBeNull()
    expect(mocks.tasks).toHaveLength(0)
    vi.mocked(db.find).mockResolvedValue({ docs: [] } as never)
    vi.mocked(db.create).mockRejectedValue(new Error('write failed'))
    await expect(findOrCreateGoogleUser(db, { sub: 'new', email: 'new@test.com' })).rejects.toThrow('write failed')
    expect(mocks.tasks).toHaveLength(0)
  })
})
