'use client'

import { useEffect, useId, useState } from 'react'

import { apiFetch, withQuery } from '@/lib/api-client'
import type { Participant } from '@/lib/api-types'
import type { Side } from '@/lib/team-logic'
import form from '@/components/ui/form.module.css'
import { Avatar } from './bits'
import styles from './Invites.module.css'

/** A person from the search: what a public profile shows, never an email or a number. */
export type FoundPlayer = Pick<Participant, 'id' | 'name' | 'initials' | 'avatarUrl'> & { id: string }

const MIN_CHARS = 2
const DEBOUNCE_MS = 250

/**
 * "Oyunçu axtar": a search box over `GET /api/v1/users`, with one button per side next to each
 * person. `onPick` decides what choosing means: the create form keeps the pick until the game is
 * saved, the game page sends the invite at once. Pass `gameId` to leave out people already in the
 * game or invited, and `taken` for the ones picked locally.
 */
export function PlayerSearch({
  gameId,
  sideLabels,
  taken = [],
  disabled = false,
  onPick,
}: {
  gameId?: string
  /** What each side is called: its club, or "A komandası" / "B komandası". */
  sideLabels: Record<Side, string>
  taken?: string[]
  disabled?: boolean
  onPick: (player: FoundPlayer, side: Side) => void | Promise<void>
}) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<FoundPlayer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The search text the results on screen answer, so "nobody found" never shows before the search ran.
  const [settled, setSettled] = useState<string | null>(null)
  const searching = query.trim().length >= MIN_CHARS

  useEffect(() => {
    if (!searching) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      apiFetch<{ users: FoundPlayer[] }>(withQuery('/api/v1/users', { q: query.trim(), gameId }), { signal: controller.signal })
        .then(({ users }) => {
          setFound(users)
          setError(null)
          setSettled(query.trim())
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return
          setFound([])
          setSettled(query.trim())
          setError(err instanceof Error ? err.message : 'Axtarış alınmadı.')
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, searching, gameId])

  async function pick(player: FoundPlayer, side: Side) {
    setBusy(true)
    try {
      await onPick(player, side)
      setQuery('')
      setFound([])
    } finally {
      setBusy(false)
    }
  }

  const shown = searching ? found.filter((player) => !taken.includes(player.id)) : []

  return (
    <div className={styles.search}>
      <label htmlFor={id} className={form.labelSmall}>
        Oyunçu axtar
      </label>
      <input
        id={id}
        type="search"
        className={`${form.input} ${form.inputCompact}`}
        autoComplete="off"
        placeholder="Adını yazın, məs. Əli"
        value={query}
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
      />
      {error && (
        <p className={form.alert} role="alert">
          {error}
        </p>
      )}
      {/* Announced once the results settle, so a screen reader hears that the search found something. */}
      <p className="visually-hidden" aria-live="polite">
        {searching && !error ? `${shown.length} nəticə` : ''}
      </p>
      {shown.length > 0 && (
        <ul className={styles.results} aria-label="Axtarış nəticələri">
          {shown.map((player) => (
            <li key={player.id} className={styles.result}>
              <span className={styles.who}>
                <Avatar person={player} size={36} decorative />
                <span className={styles.name}>{player.name}</span>
              </span>
              <span className={styles.sidePicks}>
                {(['home', 'away'] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    className={styles.sidePick}
                    disabled={busy || disabled}
                    aria-label={`${player.name} oyunçusunu ${sideLabels[side]} üçün dəvət et`}
                    onClick={() => pick(player, side)}
                  >
                    {sideLabels[side]}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
      {searching && !error && settled === query.trim() && found.length === 0 && <p className={styles.note}>Heç kim tapılmadı.</p>}
    </div>
  )
}
