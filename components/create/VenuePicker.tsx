'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'

import { apiFetch, withQuery } from '@/lib/api-client'
import type { Venue } from '@/lib/api-types'
import { foldForSearch } from '@/lib/game-backend'
import form from '@/components/ui/form.module.css'
import styles from './GameForm.module.css'

type VenueLists = Record<string, Venue[] | 'error'>

function matches(venue: Venue, needle: string) {
  return [venue.name, venue.district, venue.address].some((text) => text && foldForSearch(text).includes(needle))
}

/**
 * "Meydança" combobox: loads `GET /api/v1/venues?sport=…` once per sport and filters it as you type
 * (name, district or address). Follows the ARIA combobox pattern with a listbox popup.
 */
export function VenuePicker({
  sport,
  value,
  onChange,
  error,
  errorId,
}: {
  sport: string
  value: Venue | null
  onChange: (venue: Venue) => void
  error?: string
  errorId: string
}) {
  const inputId = useId()
  const listId = useId()
  const hintId = useId()
  const listRef = useRef<HTMLUListElement>(null)

  const [lists, setLists] = useState<VenueLists>({})
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)

  const list = lists[sport]

  useEffect(() => {
    if (lists[sport]) return
    let cancelled = false
    apiFetch<Venue[]>(withQuery('/api/v1/venues', { sport }))
      .then((venues) => {
        if (!cancelled) setLists((current) => ({ ...current, [sport]: venues }))
      })
      .catch(() => {
        if (!cancelled) setLists((current) => ({ ...current, [sport]: 'error' }))
      })
    return () => {
      cancelled = true
    }
  }, [sport, lists])

  const options = useMemo(() => {
    if (!Array.isArray(list)) return []
    const needle = foldForSearch(query.trim())
    return needle ? list.filter((venue) => matches(venue, needle)) : list
  }, [list, query])

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  function openList() {
    // A failed load is retried each time the list opens, instead of sticking until a reload.
    if (list === 'error') {
      setLists((current) => {
        const rest = { ...current }
        delete rest[sport]
        return rest
      })
    }
    setOpen(true)
    setQuery('')
    const selectedIndex = value && Array.isArray(list) ? list.findIndex((venue) => venue.id === value.id) : -1
    setHighlight(Math.max(0, selectedIndex))
  }

  function choose(venue: Venue) {
    onChange(venue)
    setOpen(false)
    setQuery('')
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (!open) openList()
        else setHighlight((index) => Math.min(options.length - 1, index + 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        if (open) setHighlight((index) => Math.max(0, index - 1))
        break
      case 'Enter':
        if (open && options[highlight]) {
          event.preventDefault()
          choose(options[highlight])
        }
        break
      case 'Escape':
        if (open) {
          event.preventDefault()
          setOpen(false)
          setQuery('')
        }
        break
    }
  }

  const activeId = open && options[highlight] ? `${listId}-${highlight}` : undefined
  const describedBy = [hintId, error ? errorId : null].filter(Boolean).join(' ')

  return (
    <div className={form.field}>
      <label htmlFor={inputId} className={form.labelSmall}>
        Meydança
      </label>
      <div className={`${styles.combo} ${open ? styles.comboOpen : ''}`}>
        <input
          id={inputId}
          className={`${form.input} ${form.inputCompact} ${form.withIcon}`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          placeholder={list === undefined ? 'Meydançalar yüklənir…' : 'Meydança axtar və seç'}
          value={open ? query : (value?.label ?? '')}
          onChange={(event) => {
            setQuery(event.target.value)
            setHighlight(0)
            if (!open) setOpen(true)
          }}
          onFocus={openList}
          onClick={() => {
            if (!open) openList()
          }}
          onBlur={() => {
            setOpen(false)
            setQuery('')
          }}
          onKeyDown={onKeyDown}
        />
        <span className={styles.caret} aria-hidden="true" />

        {open && (
          <ul ref={listRef} id={listId} role="listbox" aria-label="Meydançalar" className={styles.listbox}>
            {list === undefined && <li className={styles.optionEmpty}>Yüklənir…</li>}
            {list === 'error' && <li className={styles.optionEmpty}>Meydançaları yükləmək mümkün olmadı. Siyahını bağlayıb yenidən açın.</li>}
            {Array.isArray(list) && options.length === 0 && (
              <li className={styles.optionEmpty}>
                {list.length === 0 ? 'Bu idman növü üçün meydança yoxdur.' : 'Heç nə tapılmadı.'}
              </li>
            )}
            {options.map((venue, index) => (
              <li
                key={venue.id ?? venue.label}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={venue.id === value?.id}
                data-active={index === highlight}
                className={`${styles.option} ${index === highlight ? styles.optionActive : ''}`}
                // mousedown, not click: keeps focus in the input so onBlur doesn't close the list first.
                onMouseDown={(event) => {
                  event.preventDefault()
                  choose(venue)
                }}
                onMouseMove={() => setHighlight(index)}
              >
                <span className={styles.optionName}>{venue.name}</span>
                <span className={styles.optionMeta}>
                  {[venue.district, venue.address, venue.cityLabel].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p id={hintId} className={form.hint}>
        Axtarışdan seç: ad, rayon və ya ünvan yaz
      </p>
      {error && (
        <p id={errorId} className={form.fieldError}>
          {error}
        </p>
      )}
    </div>
  )
}
