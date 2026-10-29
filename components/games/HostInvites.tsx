'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { apiFetch, postJson } from '@/lib/api-client'
import type { listGameInvites } from '@/lib/invites'
import type { Side } from '@/lib/team-logic'
import { buttonClass } from '@/components/ui/button'
import form from '@/components/ui/form.module.css'
import { Avatar } from './bits'
import detail from './GameDetail.module.css'
import styles from './Invites.module.css'
import { PlayerPicker } from './PlayerPicker'

type Invites = Awaited<ReturnType<typeof listGameInvites>>

/**
 * The host's "Oyunçu dəvət et": search for a person and invite them to a side, invite a whole club,
 * and see who has been asked and who said no. An invite holds no spot; the player takes one by
 * joining. Each answer from the server is the fresh list, so the panel redraws from it.
 */
export function HostInvites({
  gameId,
  initial,
  sideLabels,
  clubs,
}: {
  gameId: string
  initial: Invites
  sideLabels: Record<Side, string>
  /** Whether each side has a club, for "bütün üzvləri dəvət et". */
  clubs: Record<Side, boolean>
}) {
  const router = useRouter()
  const [invites, setInvites] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  async function run(action: () => Promise<{ invites: Invites; invited?: number }>) {
    setBusy(true)
    setError(null)
    setMessage('')
    try {
      const answer = await action()
      setInvites(answer.invites)
      if (answer.invited !== undefined) setMessage(answer.invited === 0 ? 'Dəvət ediləcək yeni üzv yoxdur.' : `${answer.invited} nəfər dəvət olundu.`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Əməliyyat alınmadı.')
    } finally {
      setBusy(false)
    }
  }

  const invite = (body: object) => run(() => postJson(`/api/v1/games/${gameId}/invites`, body))

  return (
    <section className={detail.panel} aria-labelledby="invite-title">
      <h2 id="invite-title" className={detail.panelLabel}>
        Oyunçu dəvət et
      </h2>
      <div className={styles.actions}>
        <button type="button" className={buttonClass('primary', 'md')} disabled={busy} onClick={() => setPickerOpen(true)} aria-haspopup="dialog">
          + Oyunçu əlavə et
        </button>
      </div>
      <PlayerPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        gameId={gameId}
        sideLabels={sideLabels}
        onAdd={async (players, side) => {
          const answer = await postJson<{ invites: Invites; invited: number }>(`/api/v1/games/${gameId}/invites`, {
            invites: players.map((player) => ({ userId: Number(player.id), side })),
          })
          setInvites(answer.invites)
          setMessage(`${answer.invited} nəfər dəvət olundu.`)
          router.refresh()
        }}
      />
      {(['home', 'away'] as const).some((side) => clubs[side]) && (
        <div className={styles.actions}>
          {(['home', 'away'] as const)
            .filter((side) => clubs[side])
            .map((side) => (
              <button key={side} type="button" className={buttonClass('outlinePrimary', 'sm')} disabled={busy} onClick={() => invite({ clubSide: side })}>
                {sideLabels[side]} üzvlərini dəvət et
              </button>
            ))}
        </div>
      )}
      <p className={styles.note}>Dəvət yer tutmur: oyunçu qoşulanda yeri ayrılır. Dəvətlər onun profilində görünür.</p>
      {error && (
        <p className={form.alert} role="alert">
          {error}
        </p>
      )}
      <p className="visually-hidden" aria-live="polite">
        {message}
      </p>
      {message && <p className={styles.note}>{message}</p>}
      {invites.length > 0 && (
        <ul className={styles.list} aria-label="Dəvət olunanlar">
          {invites.map((item) => (
            <li key={item.id} className={styles.row}>
              <Avatar person={item.player} size={36} decorative />
              <span className={styles.rowText}>
                <span className={styles.name}>{item.player.name}</span>
                <span className={`${styles.sub} ${item.status === 'declined' ? styles.declined : ''}`}>
                  {sideLabels[item.side]} · {item.status === 'declined' ? 'rədd etdi' : 'cavab gözləyir'}
                </span>
              </span>
              {item.status === 'pending' && (
                <button
                  type="button"
                  className={buttonClass('outlineDark', 'sm')}
                  disabled={busy}
                  aria-label={`${item.player.name} üçün dəvəti geri götür`}
                  onClick={() => run(() => apiFetch(`/api/v1/games/${gameId}/invites/${item.id}`, { method: 'DELETE' }))}
                >
                  Geri götür
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
