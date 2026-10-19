'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, useTransition, type FormEvent } from 'react'

import { postJson } from '@/lib/api-client'
import type { GameDetail } from '@/lib/api-types'
import { MAX_SCORE, parseResultBody } from '@/lib/team-logic'
import { buttonClass } from '@/components/ui/button'
import form from '@/components/ui/form.module.css'
import detail from './GameDetail.module.css'
import styles from './ResultPanel.module.css'

const STATUS_NOTES = {
  reported: 'Təsdiq gözləyir',
  confirmed: 'Təsdiqlənib',
  disputed: 'Rəqib komanda etiraz edib',
}

/**
 * "Hesab": the score of a game that is over. The host enters it, a player on the other side
 * confirms or disputes it, and everyone else sees it with its status. What the viewer may do comes
 * from the game (`canReport`, `canConfirm`), decided by the same rules the routes enforce.
 */
export function ResultPanel({ game }: { game: GameDetail }) {
  const router = useRouter()
  const id = useId()
  const [home, setHome] = useState(game.result ? String(game.result.homeScore) : '')
  const [away, setAway] = useState(game.result ? String(game.result.awayScore) : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [refreshing, startRefresh] = useTransition()
  const { result } = game

  async function send(path: string, body: unknown) {
    setBusy(true)
    setError(null)
    try {
      await postJson(`/api/v1/games/${game.id}/${path}`, body)
      startRefresh(() => router.refresh())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hesabı yadda saxlamaq mümkün olmadı.')
      // A refused answer usually means the score changed under the viewer.
      startRefresh(() => router.refresh())
    } finally {
      setBusy(false)
    }
  }

  function report(event: FormEvent) {
    event.preventDefault()
    const parsed = parseResultBody({ homeScore: home.trim() === '' ? null : Number(home), awayScore: away.trim() === '' ? null : Number(away) })
    if (!parsed.ok) return setError(`Hər iki komandanın hesabını 0 ilə ${MAX_SCORE} arasında tam ədəd kimi daxil edin.`)
    void send('result', { homeScore: parsed.homeScore, awayScore: parsed.awayScore })
  }

  const disabled = busy || refreshing

  return (
    <section className={detail.panel} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={detail.panelLabel}>
        Hesab
      </h2>

      {result ? (
        <div>
          <p className={styles.score}>
            {result.homeScore} : {result.awayScore}
          </p>
          <p className={`${styles.status} ${styles[result.status]}`}>{STATUS_NOTES[result.status]}</p>
        </div>
      ) : (
        <p className={detail.muted}>Hesab hələ daxil edilməyib.</p>
      )}

      {game.canConfirm && (
        <div className={styles.actions}>
          <button type="button" className={buttonClass('primary', 'md')} disabled={disabled} onClick={() => send('result/confirm', { action: 'confirm' })}>
            Təsdiqlə
          </button>
          <button type="button" className={buttonClass('outlinePrimary', 'md')} disabled={disabled} onClick={() => send('result/confirm', { action: 'dispute' })}>
            Etiraz et
          </button>
        </div>
      )}

      {game.canReport && (
        <form className={styles.form} onSubmit={report} noValidate>
          <div className={styles.fields}>
            {(
              [
                ['A komandası', home, setHome],
                ['B komandası', away, setAway],
              ] as const
            ).map(([label, value, set]) => (
              <label key={label} className={form.field}>
                <span className={form.labelSmall}>{label}</span>
                <input
                  className={`${form.input} ${styles.input}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_SCORE}
                  step={1}
                  value={value}
                  onChange={(event) => set(event.target.value)}
                />
              </label>
            ))}
          </div>
          <button type="submit" className={buttonClass('primary', 'md', { block: true })} disabled={disabled}>
            {result ? 'Hesabı yenilə' : 'Hesabı daxil et'}
          </button>
        </form>
      )}

      {error && (
        <p className={form.alert} role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
