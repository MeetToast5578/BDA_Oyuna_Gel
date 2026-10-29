'use client'

import { useRouter } from 'next/navigation'
import { useId, useRef, useState, useTransition, type FormEvent } from 'react'

import { postJson } from '@/lib/api-client'
import type { GameDetail } from '@/lib/api-types'
import { MAX_SCORE, outcomeFor, parseResultBody } from '@/lib/team-logic'
import { buttonClass } from '@/components/ui/button'
import danger from '@/components/ui/danger.module.css'
import form from '@/components/ui/form.module.css'
import { Modal } from '@/components/ui/Modal'
import detail from './GameDetail.module.css'
import styles from './ResultPanel.module.css'

const OUTCOME_NOTES = { win: 'Siz qalib gəldiniz', draw: 'Heç-heçə', loss: 'Siz uduzdunuz' }

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
  // Confirming is final and disputing sends the score back, so each asks once more, score in words.
  const [answer, setAnswer] = useState<'confirm' | 'dispute' | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const { result } = game
  // The names every other part of the page gives the sides.
  const sideNames = { home: game.teams.home?.name ?? 'A komandası', away: game.teams.away?.name ?? 'B komandası' }
  const scoreLine = result ? `${sideNames.home} ${result.homeScore} : ${result.awayScore} ${sideNames.away}` : ''

  async function send(path: string, body: unknown) {
    setBusy(true)
    setError(null)
    try {
      await postJson(`/api/v1/games/${game.id}/${path}`, body)
      setAnswer(null)
      // The button pressed is gone after the refresh; focus lands on the panel, which reads the new status.
      requestAnimationFrame(() => heading.current?.focus())
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
      <h2 id={`${id}-title`} ref={heading} tabIndex={-1} className={detail.panelLabel}>
        Hesab
      </h2>

      {result ? (
        <div>
          <p className={styles.score} aria-label={scoreLine}>
            {result.homeScore} : {result.awayScore}
          </p>
          <p className={detail.muted} aria-hidden="true">
            {sideNames.home} — {sideNames.away}
          </p>
          <p className={`${styles.status} ${styles[result.status]}`}>{STATUS_NOTES[result.status]}</p>
          {/* Only a settled score says who won; a reported one can still change. */}
          {result.status === 'confirmed' && game.viewer.side && (
            <p className={`${styles.outcome} ${styles[outcomeFor(game.viewer.side, result.homeScore, result.awayScore)]}`}>
              {OUTCOME_NOTES[outcomeFor(game.viewer.side, result.homeScore, result.awayScore)]}
            </p>
          )}
        </div>
      ) : (
        <p className={detail.muted}>Hesab hələ daxil edilməyib.</p>
      )}

      {game.canConfirm && (
        <div className={styles.actions}>
          <button type="button" className={buttonClass('primary', 'md')} disabled={disabled} aria-haspopup="dialog" onClick={() => setAnswer('confirm')}>
            Təsdiqlə
          </button>
          <button type="button" className={buttonClass('outlinePrimary', 'md')} disabled={disabled} aria-haspopup="dialog" onClick={() => setAnswer('dispute')}>
            Etiraz et
          </button>
        </div>
      )}

      <Modal
        open={answer !== null}
        onClose={() => {
          if (!busy) setAnswer(null)
        }}
        title={answer === 'dispute' ? 'Hesaba etiraz edirsiniz?' : 'Hesabı təsdiqləyirsiniz?'}
      >
        <div className={danger.confirm}>
          <p className={styles.score}>{scoreLine}</p>
          <p className={danger.dangerText}>
            {answer === 'dispute'
              ? 'Host hesabı yenidən daxil etməli olacaq.'
              : 'Təsdiqlənən hesab nəticələrə yazılır və sonra dəyişdirilə bilməz.'}
          </p>
          {error && (
            <p className={form.alert} role="alert">
              {error}
            </p>
          )}
          <div className={danger.confirmActions}>
            {/* Focus starts on going back, so Enter never settles a score by accident. */}
            <button type="button" className={buttonClass('muted', 'lg')} onClick={() => setAnswer(null)} disabled={busy} data-autofocus>
              İmtina et
            </button>
            <button
              type="button"
              className={buttonClass('primary', 'lg')}
              onClick={() => send('result/confirm', { action: answer })}
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? 'Göndərilir…' : answer === 'dispute' ? 'Bəli, etiraz et' : 'Bəli, təsdiqlə'}
            </button>
          </div>
        </div>
      </Modal>

      {game.canReport && (
        <form className={styles.form} onSubmit={report} noValidate>
          <div className={styles.fields}>
            {(
              [
                [sideNames.home, home, setHome],
                [sideNames.away, away, setAway],
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
