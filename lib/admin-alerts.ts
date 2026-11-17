import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import type { Payload } from 'payload'

import { escapeHtml } from '@/lib/emails'
import { afterResponse } from '@/lib/notify'
import { SITE_URL } from '@/lib/site-url'

const LABELS = {
  player_registered: 'Yeni oyunçu qeydiyyatdan keçdi',
  game_created: 'Yeni oyun yaradıldı',
  player_joined: 'Oyunçu oyuna qoşuldu',
  player_left: 'Oyunçu oyundan çıxdı',
  game_updated: 'Oyun yeniləndi',
  game_deleted: 'Oyun silindi',
} as const

export type AdminEvent = {
  type: keyof typeof LABELS
  actorId: number
  actorName?: string | null
  game?: { id: string | number; title: string }
}

/** A separate sender prevents admin setup from turning on player-facing emails. */
function settings() {
  if (process.env.ADMIN_EMAIL_ENABLED !== 'true' || process.env.VERCEL_ENV === 'preview') return null
  const user = process.env.ADMIN_GMAIL_USER?.trim()
  const pass = process.env.ADMIN_GMAIL_APP_PASSWORD?.replace(/\s/g, '')
  const to = (process.env.ADMIN_ALERT_EMAIL || user)?.trim()
  const email = /^[^\s<>;,]+@[^\s<>;,]+\.[^\s<>;,]+$/
  if (!user || !pass || !to || !email.test(user) || !email.test(to)) return null
  return { user, pass, to }
}

export function adminAlertEmail(event: AdminEvent, actorName: string, occurredAt: Date) {
  const label = LABELS[event.type]
  const time = new Intl.DateTimeFormat('az', { timeZone: 'Asia/Baku', dateStyle: 'medium', timeStyle: 'short' }).format(occurredAt)
  const profile = `${SITE_URL}/users/${encodeURIComponent(String(event.actorId))}`
  const lines = [label, `Oyunçu: ${actorName}`, `Vaxt: ${time} (Bakı)`]
  if (event.game) lines.push(`Oyun: ${event.game.title}`)
  const links = [{ href: profile, label: 'Oyunçunun profili' }]
  if (event.game && event.type !== 'game_deleted') links.push({ href: `${SITE_URL}/games/${encodeURIComponent(String(event.game.id))}`, label: 'Oyuna bax' })
  else if (event.game) links.push({ href: `${SITE_URL}/games`, label: 'Oyunlar' })
  return {
    // Fixed subjects keep user-entered titles/names out of email headers.
    subject: `[OyunaGəl admin] ${label}`,
    text: [...lines, ...links.map((link) => `${link.label}: ${link.href}`)].join('\n\n'),
    html: [...lines.map((line) => `<p>${escapeHtml(line)}</p>`), ...links.map((link) => `<p><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></p>`)].join(''),
  }
}

/** Best effort: do not expose credentials, private form data or SMTP error bodies in logs. */
export async function sendAdminAlert(payload: Payload, event: AdminEvent, occurredAt = new Date()) {
  const config = settings()
  if (!config) return 'disabled' as const
  try {
    const actor = event.actorName || (await payload.findByID({ collection: 'users', id: event.actorId, select: { fullName: true }, overrideAccess: true })).fullName || `Oyunçu ${event.actorId}`
    const adapter = await nodemailerAdapter({
      defaultFromAddress: config.user,
      defaultFromName: 'OyunaGəl admin bildirişləri',
      skipVerify: true,
      transportOptions: {
        host: 'smtp.gmail.com', port: 465, secure: true,
        connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
        auth: { user: config.user, pass: config.pass },
      },
    })
    await adapter({ payload }).sendEmail({ to: config.to, ...adminAlertEmail(event, actor, occurredAt) })
    console.info('admin_email', { event: event.type, status: 'sent' })
    return 'sent' as const
  } catch {
    console.error('admin_email', { event: event.type, status: 'failed' })
    return 'failed' as const
  }
}

/** Call only after the action commits. No SMTP work runs on the user's response path. */
export function scheduleAdminAlert(payload: Payload | (() => Promise<Payload>), event: AdminEvent) {
  if (!settings()) return
  const occurredAt = new Date()
  afterResponse(async () => {
    try { await sendAdminAlert(typeof payload === 'function' ? await payload() : payload, event, occurredAt) }
    catch { console.error('admin_email', { event: event.type, status: 'failed' }) }
  })
}
