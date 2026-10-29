// The emails the site sends about games. Pure: each returns what `payload.sendEmail` needs.

import { SITE_URL } from '@/lib/site-url'

export type Email = {
  subject: string
  html: string
  text: string
  attachments?: Array<{ filename: string; content: string; contentType: string }>
}

type EmailGame = {
  id: string
  title: string
  dateLabel: string | null
  timeLabel: string | null
  venue: { name: string; address: string | null }
}

/** Titles and venue names are typed by users, so they are escaped before going into HTML. */
export const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const when = (game: EmailGame) => [game.dateLabel, game.timeLabel].filter(Boolean).join(', ')
const where = (game: EmailGame) => [game.venue.name, game.venue.address].filter(Boolean).join(', ')

/** The same lines as HTML paragraphs and as plain text, with the opt-out under both. */
function build(subject: string, lines: string[], link?: { href: string; label: string }): Email {
  const footer = `Bu bildirişləri profilinizdə söndürə bilərsiniz: ${SITE_URL}/profile`
  const html = [
    ...lines.map((line) => `<p>${escapeHtml(line)}</p>`),
    link ? `<p><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></p>` : '',
    `<p style="color:#5c665f;font-size:12px">${escapeHtml(footer)}</p>`,
  ].join('\n')
  const text = [...lines, ...(link ? [`${link.label}: ${link.href}`] : []), '', footer].join('\n')
  return { subject, html, text }
}

/** To the player who just joined, with the game as a calendar file that reminds them before it starts. */
export function joinedEmail(game: EmailGame, ics: string | null): Email {
  const email = build(
    `Oyuna qoşuldunuz: ${game.title}`,
    [
      `"${game.title}" oyununa qoşuldunuz.`,
      `Vaxt: ${when(game)}`,
      `Yer: ${where(game)}`,
      ...(ics ? ['Oyunu təqviminizə əlavə etmək üçün əlavədəki faylı açın; təqvim başlamazdan 2 saat əvvəl xatırladacaq.'] : []),
    ],
    { href: `${SITE_URL}/games/${game.id}`, label: 'Oyuna bax' },
  )
  return ics ? { ...email, attachments: [{ filename: `oyun-${game.id}.ics`, content: ics, contentType: 'text/calendar; charset=utf-8' }] } : email
}

/** To everyone in the game when the host moves it to another time or venue. */
export function gameChangedEmail(game: EmailGame): Email {
  return build(
    `Oyun dəyişdi: ${game.title}`,
    [`Host "${game.title}" oyununun vaxtını və ya yerini dəyişdi.`, `Yeni vaxt: ${when(game)}`, `Yeni yer: ${where(game)}`],
    { href: `${SITE_URL}/games/${game.id}`, label: 'Oyuna bax' },
  )
}

/** To everyone who was in a game that will no longer happen. */
export function gameCancelledEmail(game: EmailGame): Email {
  return build(
    `Oyun ləğv edildi: ${game.title}`,
    [`"${game.title}" oyunu (${when(game)}, ${game.venue.name}) ləğv edildi.`, 'Başqa açıq oyunlara baxa bilərsiniz.'],
    { href: `${SITE_URL}/games`, label: 'Açıq oyunlar' },
  )
}

/** To a player the host took out of a game that hasn't started. */
export function removedFromGameEmail(game: EmailGame): Email {
  return build(
    `Oyundan çıxarıldınız: ${game.title}`,
    [`Host sizi "${game.title}" oyunundan (${when(game)}, ${game.venue.name}) çıxardı.`, 'Başqa açıq oyunlara baxa bilərsiniz.'],
    { href: `${SITE_URL}/games`, label: 'Açıq oyunlar' },
  )
}

/** To a player the host invited to a side of a game: the invitation holds no spot until they join. */
export function invitedEmail(game: EmailGame & { hostName: string }, side: 'home' | 'away', sideLabel: string): Email {
  return build(
    `Oyuna dəvət: ${game.title}`,
    [
      `${game.hostName} sizi "${game.title}" oyununa dəvət etdi (${sideLabel}).`,
      `Vaxt: ${when(game)}`,
      `Yer: ${where(game)}`,
      'Dəvət yer tutmur: oyuna qoşulduğunuz anda yeriniz ayrılır.',
    ],
    { href: `${SITE_URL}/games/${game.id}?join=1&side=${side}`, label: 'Bax və qoşul' },
  )
}

/** To the first person waiting for a full game when a spot came back and was handed to them. */
export function promotedEmail(game: EmailGame): Email {
  return build(
    `Oyunda yer qazandınız: ${game.title}`,
    [
      `Gözləmə siyahısından "${game.title}" oyununda sizə yer verildi.`,
      `Vaxt: ${when(game)}`,
      `Yer: ${where(game)}`,
      'Gələ bilmirsinizsə, oyun səhifəsindən çıxın ki, yer növbədəkinə keçsin.',
    ],
    { href: `${SITE_URL}/games/${game.id}`, label: 'Oyuna bax' },
  )
}
