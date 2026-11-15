'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { apiFetch, patchJson } from '@/lib/api-client'
import type { GamePlayers, Participant } from '@/lib/api-types'
import { buttonClass } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import form from '@/components/ui/form.module.css'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { otherSide, type Side } from '@/lib/team-logic'
import { Avatar, AvatarStack } from './bits'
import styles from './PlayersButton.module.css'

/** A list read this recently is shown as it is when the list opens, rather than read again. */
const FRESH_MS = 5_000

/**
 * A game's avatar row as one button. It opens "İştirakçılar", everyone in the game with a row each,
 * and a row opens that player's profile; the avatars themselves are not separate targets.
 *
 * The list is read when it opens, and again on every later open so a join from a second ago shows.
 * Hovering or focusing the button starts the read early, so it is usually there by the click.
 *
 * The dialog is portalled to <body>: the home carousel's buffer copies are `aria-hidden`, and a
 * dialog inside one would be hidden from screen readers too.
 */
export function PlayersButton({
  gameId,
  gameTitle,
  people,
  total,
  size,
  overlap,
  moreStyle,
  tabIndex,
  className,
}: {
  gameId: string
  gameTitle: string
  /** The avatar row: the first players who joined. */
  people: Participant[]
  /** Everyone counted in the game, for the "+N". */
  total: number
  size: number
  overlap: number
  moreStyle?: { bg: string; color: string }
  tabIndex?: number
  /** May set --trigger-hover and --trigger-ring, the hover background and focus ring (e.g. on a dark card). */
  className?: string
}) {
  const [open, setOpen] = useState(false)
  // The dialog mounts on the first open and then stays, so closing can animate.
  const [mounted, setMounted] = useState(false)
  const [list, setList] = useState<GamePlayers | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef<Promise<void> | null>(null)
  const readAt = useRef(0)
  const router = useRouter()

  // A join or leave re-renders the page with a new count, so a list read before it is out of date.
  useEffect(() => {
    readAt.current = 0
  }, [total])

  function read() {
    if (pending.current) return
    if (Date.now() - readAt.current < FRESH_MS) return
    setError(null)
    pending.current = apiFetch<GamePlayers>(`/api/v1/games/${gameId}/participants`)
      .then((next) => {
        setList(next)
        readAt.current = Date.now()
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'İştirakçıları yükləmək mümkün olmadı.')
      })
      .finally(() => {
        pending.current = null
      })
  }

  // The host's move answers with the fresh list; the page behind it also shows each side's free spots.
  function moved(next: GamePlayers) {
    setList(next)
    readAt.current = Date.now()
    router.refresh()
  }

  function show() {
    setMounted(true)
    setOpen(true)
    read()
  }

  return (
    <>
      <button
        type="button"
        className={`${styles.trigger} ${className ?? ''}`}
        onClick={show}
        onPointerEnter={read}
        onFocus={read}
        aria-haspopup="dialog"
        aria-label={`İştirakçılara bax (${total} nəfər)`}
        tabIndex={tabIndex}
      >
        <AvatarStack people={people} total={total} size={size} overlap={overlap} moreStyle={moreStyle} />
      </button>

      {mounted &&
        createPortal(
          <Modal open={open} onClose={() => setOpen(false)} title="İştirakçılar" subtitle={gameTitle} wide>
            {list ? (
              <PlayersList list={list} gameId={gameId} onMoved={moved} onPick={() => setOpen(false)} />
            ) : error ? (
              <div className={styles.failed}>
                <p className={form.alert} role="alert">
                  {error}
                </p>
                <button type="button" className={buttonClass('outlinePrimary', 'md')} onClick={read}>
                  Yenidən cəhd et
                </button>
              </div>
            ) : (
              <ul className={styles.list} aria-busy="true" aria-label="İştirakçılar yüklənir">
                {/* The host, plus up to three of the players: roughly the list about to arrive. */}
                {Array.from({ length: Math.min(total, 3) + 1 }, (_, index) => (
                  <li key={index} className={styles.row}>
                    <span className={`skeleton ${styles.skeletonAvatar}`} />
                    <span className={`skeleton ${styles.skeletonName}`} />
                  </li>
                ))}
              </ul>
            )}
          </Modal>,
          document.body,
        )}
    </>
  )
}

function PlayersList({
  list,
  gameId,
  onMoved,
  onPick,
}: {
  list: GamePlayers
  gameId: string
  onMoved: (next: GamePlayers) => void
  onPick: () => void
}) {
  // Same colors as the avatar row, which draws the players in join order.
  const players = list.players.map((player, toneIndex) => ({ player, toneIndex }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The player whose "✕" was pressed: the dialog asks before taking them out.
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null)
  // A side with a club is named after it.
  const labels = { home: list.sideNames.home ?? 'A komandası', away: list.sideNames.away ?? 'B komandası' }

  async function change(body: { balance: true } | { assignments: { userId: number; side: Side }[] }) {
    setBusy(true)
    setError(null)
    try {
      onMoved(await patchJson<GamePlayers>(`/api/v1/games/${gameId}/sides`, body))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Komandaları dəyişmək mümkün olmadı.')
    } finally {
      setBusy(false)
    }
  }

  // "Gəldi" / "Gəlmədi" after the game; pressing the chosen one again clears it.
  async function mark(userId: string, attendance: 'came' | 'absent' | null) {
    setBusy(true)
    setError(null)
    try {
      onMoved(await patchJson<GamePlayers>(`/api/v1/games/${gameId}/attendance`, { userId: Number(userId), attendance }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gələnləri qeyd etmək mümkün olmadı.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(userId: string) {
    setBusy(true)
    setError(null)
    try {
      onMoved(await apiFetch<GamePlayers>(`/api/v1/games/${gameId}/players/${userId}`, { method: 'DELETE' }))
      setRemoving(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Oyunçunu çıxarmaq mümkün olmadı.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {list.canMove && (
        <div className={styles.manage}>
          <button type="button" className={buttonClass('outlinePrimary', 'md')} disabled={busy} onClick={() => change({ balance: true })}>
            Balansla
          </button>
        </div>
      )}
      {error && (
        <p className={form.alert} role="alert">
          {error}
        </p>
      )}
      <div className={styles.sides}>
        {(['home', 'away'] as const).map((side) => (
          <section key={side} aria-label={labels[side]}>
            <h3 className={styles.sideTitle}>{labels[side]}</h3>
            <ul className={styles.list}>
              {list.host.side === side && (
                <li>
                  <PlayerRow person={list.host} host onPick={onPick} />
                </li>
              )}
              {players
                .filter(({ player }) => player.side === side)
                .map(({ player, toneIndex }) => (
                  <li
                    key={player.id ?? `gone-${toneIndex}`}
                    className={(list.canMove || list.canMarkAttendance) && player.id ? styles.withMove : undefined}
                  >
                    <PlayerRow person={player} toneIndex={toneIndex} onPick={onPick} />
                    {list.canMarkAttendance && player.id && (
                      <div className={styles.attendance} role="group" aria-label={`${player.name} oyuna gəldi?`}>
                        {(['came', 'absent'] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            className={`${styles.attend} ${player.attendance === value ? styles[value] : ''}`}
                            disabled={busy}
                            aria-pressed={player.attendance === value}
                            onClick={() => mark(player.id as string, player.attendance === value ? null : value)}
                          >
                            {value === 'came' ? 'Gəldi' : 'Gəlmədi'}
                          </button>
                        ))}
                      </div>
                    )}
                    {list.canMove && player.id && (
                      <button
                        type="button"
                        className={styles.move}
                        disabled={busy}
                        aria-label={`${player.name} oyunçusunu ${labels[otherSide(side)]} tərəfinə köçür`}
                        title={`${labels[otherSide(side)]} tərəfinə köçür`}
                        onClick={() => change({ assignments: [{ userId: Number(player.id), side: otherSide(side) }] })}
                      >
                        <span aria-hidden="true">⇄</span>
                      </button>
                    )}
                    {list.canMove && player.id && (
                      <button
                        type="button"
                        className={`${styles.move} ${styles.remove}`}
                        disabled={busy}
                        aria-haspopup="dialog"
                        aria-label={`${player.name} oyunçusunu oyundan çıxar`}
                        onClick={() => {
                          setError(null)
                          setRemoving({ id: player.id as string, name: player.name })
                        }}
                      >
                        <span aria-hidden="true">✕</span>
                      </button>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
      {list.canMarkAttendance && (
        <p className={styles.others}>Kim gəldi? Qeyd edin: oyunçuların profilində etibarlılıq kimi görünür. Bir həftə ərzində dəyişmək olar.</p>
      )}
      {list.others > 0 && <p className={styles.others}>+{list.others} nəfər hostla birlikdə gəlir</p>}
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`${removing?.name ?? 'Oyunçu'} oyundan çıxarılsın?`}
        text="Yeri oyuna qayıdır; gözləmə siyahısında kimsə varsa, ona verilir."
        confirmLabel="Bəli, çıxar"
        pendingLabel="Çıxarılır…"
        onConfirm={() => removing && remove(removing.id)}
        pending={busy}
        error={error}
      />
    </>
  )
}


/** A row opens the player's profile — your own row, your own `/profile`. A deleted account's row opens nothing. */
function PlayerRow({
  person,
  host = false,
  toneIndex,
  onPick,
}: {
  person: GamePlayers['host']
  host?: boolean
  toneIndex?: number
  onPick: () => void
}) {
  const content = (
    <>
      <Avatar person={person} size={40} toneIndex={toneIndex} decorative />
      <span className={styles.name}>{person.name}</span>
      {host && <span className={`${styles.tag} ${styles.hostTag}`}>Host</span>}
      {person.you && <span className={`${styles.tag} ${styles.youTag}`}>Siz</span>}
    </>
  )

  if (!person.id) return <div className={styles.row}>{content}</div>

  return (
    <Link
      href={person.you ? '/profile' : `/users/${person.id}`}
      className={`${styles.row} ${styles.link}`}
      // Closed first: the page stays mounted in the background, and Back should not reopen the list.
      onClick={onPick}
    >
      {content}
      <Icon name="chevron" className={styles.chevron} />
    </Link>
  )
}
