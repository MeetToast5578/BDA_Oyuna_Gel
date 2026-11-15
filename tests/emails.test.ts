import { describe, expect, it } from 'vitest'

import { escapeHtml, gameCancelledEmail, gameChangedEmail, invitedEmail, joinedEmail, removedFromGameEmail } from '@/lib/emails'
import { parseProfileUpdate } from '@/lib/game-backend'

const GAME = {
  id: '42',
  title: 'Axşam futbolu',
  dateLabel: 'Şən, 18 Okt',
  timeLabel: '19:00',
  venue: { name: 'Aku Arena', address: 'Nizami küç. 5' },
}

describe('game emails', () => {
  it('confirms a join with when, where, a link and the calendar file', () => {
    const email = joinedEmail(GAME, 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n')
    expect(email.subject).toBe('Oyuna qoşuldunuz: Axşam futbolu')
    expect(email.text).toContain('Vaxt: Şən, 18 Okt, 19:00')
    expect(email.text).toContain('Yer: Aku Arena, Nizami küç. 5')
    expect(email.text).toContain('/games/42')
    expect(email.text).toContain('/profile')
    expect(email.attachments).toEqual([
      { filename: 'oyun-42.ics', content: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n', contentType: 'text/calendar; charset=utf-8' },
    ])
    expect(joinedEmail(GAME, null).attachments).toBeUndefined()
  })

  it('escapes a title a host typed, so it cannot inject HTML', () => {
    const email = joinedEmail({ ...GAME, title: '<img src=x onerror=alert(1)>' }, null)
    expect(email.html).not.toContain('<img')
    expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(escapeHtml(`a&b"c'd`)).toBe('a&amp;b&quot;c&#39;d')
  })

  it('tells players about a new time or place, and about a cancellation', () => {
    expect(gameChangedEmail(GAME).subject).toBe('Oyun dəyişdi: Axşam futbolu')
    expect(gameChangedEmail(GAME).text).toContain('Yeni vaxt: Şən, 18 Okt, 19:00')
    const cancelled = gameCancelledEmail(GAME)
    expect(cancelled.subject).toBe('Oyun ləğv edildi: Axşam futbolu')
    expect(cancelled.text).toContain('(Şən, 18 Okt, 19:00, Aku Arena)')
  })

  it('invites a player to a side, linking to the join form on that side, and says it holds no spot', () => {
    const invited = invitedEmail({ ...GAME, hostName: '<i>Elvin</i>' }, 'away', 'B komandası')
    expect(invited.subject).toBe('Oyuna dəvət: Axşam futbolu')
    expect(invited.text).toContain('(B komandası)')
    expect(invited.text).toContain('/games/42?join=1&side=away')
    expect(invited.text).toContain('yer tutmur')
    expect(invited.html).toContain('&lt;i&gt;Elvin&lt;/i&gt;')
  })

  it('tells a player the host took them out, with the game\'s title escaped', () => {
    const removed = removedFromGameEmail({ ...GAME, title: '<b>Axşam</b>' })
    expect(removed.subject).toBe('Oyundan çıxarıldınız: <b>Axşam</b>')
    expect(removed.text).toContain('(Şən, 18 Okt, 19:00, Aku Arena)')
    expect(removed.html).toContain('&lt;b&gt;Axşam&lt;/b&gt;')
    expect(removed.html).not.toContain('<b>Axşam</b>')
  })
})

describe('parseProfileUpdate emailNotifications', () => {
  it('takes a boolean and refuses anything else', () => {
    expect(parseProfileUpdate({ emailNotifications: false })).toEqual({ ok: true, value: { emailNotifications: false } })
    expect(parseProfileUpdate({ emailNotifications: 'no' })).toMatchObject({ ok: false, code: 'INVALID_NOTIFICATIONS' })
  })
})
