'use client'

import { useEffect, useId, useRef, useState } from 'react'

import { apiFetch, withQuery } from '@/lib/api-client'
import type { Participant } from '@/lib/api-types'
import type { Side } from '@/lib/team-logic'
import { buttonClass } from '@/components/ui/button'
import form from '@/components/ui/form.module.css'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from './bits'
import styles from './Invites.module.css'

/** A person from the list: what a public profile shows, never an email or a number. */
export type FoundPlayer = Pick<Participant, 'name' | 'initials' | 'avatarUrl'> & { id: string }

type Filter = 'all' | 'clubs' | 'recent'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Hamısı' },
  { value: 'clubs', label: 'Komandam' },
  { value: 'recent', label: 'Son oynadıqlarım' },
]
const DEBOUNCE_MS = 250
type Answer = { users: FoundPlayer[]; hasMore: boolean }

/**
 * "Oyunçu əlavə et": a window with every player in a list. Type in the search bar to narrow it by
 * name, or switch to "Komandam" (members of your clubs) or "Son oynadıqlarım" (people you have played
 * with). Tick the people you want, choose their team, and press "Əlavə et": `onAdd` gets them all at
 * once. What adding means is the caller's: the create form keeps them until the game is saved, the
 * game page invites them straight away. Pass `gameId` to leave out people already in the game or
 * invited, and `taken` for the ones the caller has picked locally.
 */
export function PlayerPicker(props: PickerProps) {
  // The body is a new component each time the window opens, so nothing ticked or typed carries over.
  const [session, setSession] = useState(0)
  const [wasOpen, setWasOpen] = useState(false)
  if (props.open !== wasOpen) {
    setWasOpen(props.open)
    if (props.open) setSession((current) => current + 1)
  }
  return (
    <Modal open={props.open} onClose={props.onClose} title="Oyunçu əlavə et" subtitle="Siyahıdan seçin, sonra Əlavə et düyməsini basın">
      <PickerBody key={session} {...props} />
    </Modal>
  )
}

type PickerProps = {
  open: boolean
  onClose: () => void
  gameId?: string
  /** What each side is called: its club, or "A komandası" / "B komandası". */
  sideLabels: Record<Side, string>
  /** The side the picks go to until the person changes it. */
  defaultSide?: Side
  taken?: string[]
  /** Throw to keep the window open with the message shown. */
  onAdd: (players: FoundPlayer[], side: Side) => void | Promise<void>
}

function PickerBody({
  open,
  onClose,
  gameId,
  sideLabels,
  defaultSide = 'home',
  taken = [],
  onAdd,
}: PickerProps) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [side, setSide] = useState<Side>(defaultSide)
  const [players, setPlayers] = useState<FoundPlayer[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Map<string, FoundPlayer>>(new Map())
  const [busy, setBusy] = useState(false)
  // The search text the list on screen answers, so "nobody found" never shows before the search ran.
  const [settled, setSettled] = useState<string | null>(null)
  const page = useRef(1)

  async function load(next: number, signal: AbortSignal) {
    setLoading(true)
    try {
      const answer = await apiFetch<Answer>(withQuery('/api/v1/users', { q: query.trim(), filter, page: next, gameId }), { signal })
      page.current = next
      setPlayers((current) => (next === 1 ? answer.users : [...current, ...answer.users.filter((user) => !current.some((known) => known.id === user.id))]))
      setHasMore(answer.hasMore)
      setError(null)
      setSettled(`${filter}:${query.trim()}`)
    } catch (err) {
      if (signal.aborted) return
      if (next === 1) setPlayers([])
      setHasMore(false)
      setSettled(`${filter}:${query.trim()}`)
      setError(err instanceof Error ? err.message : 'Oyunçuları yükləmək mümkün olmadı.')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }

  // Every change of the search or the filter starts the list again from its first page.
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const timer = setTimeout(() => void load(1, controller.signal), query ? DEBOUNCE_MS : 0)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` reads exactly these
  }, [open, query, filter, gameId])

  const shown = players.filter((player) => !taken.includes(player.id))
  const toggle = (player: FoundPlayer) =>
    setSelected((current) => {
      const next = new Map(current)
      if (next.has(player.id)) next.delete(player.id)
      else next.set(player.id, player)
      return next
    })
  const allShownSelected = shown.length > 0 && shown.every((player) => selected.has(player.id))

  async function add() {
    setBusy(true)
    setError(null)
    try {
      await onAdd([...selected.values()], side)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Oyunçuları əlavə etmək mümkün olmadı.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className={styles.pickTools}>
        <div>
          <label htmlFor={`${id}-q`} className="visually-hidden">
            Oyunçu axtar
          </label>
          <input
            id={`${id}-q`}
            type="search"
            className={`${form.input} ${form.inputCompact}`}
            autoComplete="off"
            placeholder="Adı yazın, məs. Əli"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            data-autofocus
          />
        </div>
        <div className={styles.filters} role="group" aria-label="Kimləri göstərək">
          {FILTERS.map((item) => (
            <button key={item.value} type="button" className={styles.filter} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className={form.alert} role="alert">
          {error}
        </p>
      )}

      <div className={styles.pickMeta}>
        <p className={styles.note} aria-live="polite">
          {loading && shown.length === 0 ? 'Yüklənir…' : `${shown.length} oyunçu${hasMore ? '+' : ''}`}
        </p>
        {shown.length > 0 && (
          <button
            type="button"
            className={styles.linkButton}
            onClick={() =>
              setSelected((current) => {
                const next = new Map(current)
                for (const player of shown) {
                  if (allShownSelected) next.delete(player.id)
                  else next.set(player.id, player)
                }
                return next
              })
            }
          >
            {allShownSelected ? 'Seçimi təmizlə' : 'Hamısını seç'}
          </button>
        )}
      </div>

      <ul className={styles.pickList} aria-label="Oyunçular" aria-busy={loading}>
        {shown.map((player) => (
          <li key={player.id}>
            <label className={styles.pickRow}>
              <input type="checkbox" checked={selected.has(player.id)} onChange={() => toggle(player)} />
              <Avatar person={player} size={36} decorative />
              <span className={styles.name}>{player.name}</span>
            </label>
          </li>
        ))}
        {!loading && settled === `${filter}:${query.trim()}` && shown.length === 0 && !error && (
          <li className={styles.note} style={{ padding: 12 }}>
            {filter === 'clubs' ? 'Komandanızda başqa üzv yoxdur.' : filter === 'recent' ? 'Hələ heç kimlə birlikdə oynamamısınız.' : 'Heç kim tapılmadı.'}
          </li>
        )}
        {hasMore && (
          <li style={{ padding: 8 }}>
            <button type="button" className={buttonClass('outlineDark', 'sm')} disabled={loading} onClick={() => void load(page.current + 1, new AbortController().signal)}>
              Daha çox göstər
            </button>
          </li>
        )}
      </ul>

      <div className={styles.pickFooter}>
        <fieldset className={styles.pickSides}>
          <legend>Hansı komandaya?</legend>
          {(['home', 'away'] as const).map((value) => (
            <label key={value} className={styles.pickSide}>
              <input type="radio" name={`${id}-side`} checked={side === value} onChange={() => setSide(value)} />
              {sideLabels[value]}
            </label>
          ))}
        </fieldset>
        <div className={styles.pickActions}>
          <button type="button" className={buttonClass('primary', 'md')} disabled={busy || selected.size === 0} aria-busy={busy} onClick={add}>
            {selected.size > 0 ? `Əlavə et (${selected.size})` : 'Əlavə et'}
          </button>
          <button type="button" className={buttonClass('outlineDark', 'md')} disabled={busy} onClick={onClose}>
            İmtina et
          </button>
        </div>
      </div>
    </>
  )
}
