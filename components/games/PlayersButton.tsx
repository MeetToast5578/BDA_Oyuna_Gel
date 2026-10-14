'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { apiFetch } from '@/lib/api-client'
import type { GamePlayers, Participant } from '@/lib/api-types'
import { buttonClass } from '@/components/ui/button'
import form from '@/components/ui/form.module.css'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
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
              <PlayersList list={list} onPick={() => setOpen(false)} />
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

function PlayersList({ list, onPick }: { list: GamePlayers; onPick: () => void }) {
  // Same colors as the avatar row, which draws the players in join order.
  const players = list.players.map((player, toneIndex) => ({ player, toneIndex }))
  return (
    <>
      <div className={styles.sides}>
        {(['home', 'away'] as const).map((side) => (
          <section key={side} aria-label={SIDE_LABELS[side]}>
            <h3 className={styles.sideTitle}>{SIDE_LABELS[side]}</h3>
            <ul className={styles.list}>
              {list.host.side === side && (
                <li>
                  <PlayerRow person={list.host} host onPick={onPick} />
                </li>
              )}
              {players
                .filter(({ player }) => player.side === side)
                .map(({ player, toneIndex }) => (
                  <li key={player.id ?? `gone-${toneIndex}`}>
                    <PlayerRow person={player} toneIndex={toneIndex} onPick={onPick} />
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
      {list.others > 0 && <p className={styles.others}>+{list.others} nəfər hostla birlikdə gəlir</p>}
    </>
  )
}

const SIDE_LABELS = { home: 'A komandası', away: 'B komandası' }

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
