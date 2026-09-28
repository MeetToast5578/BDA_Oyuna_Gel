'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'

import {
  addDays,
  addMonths,
  DIAL_RINGS,
  dialValue,
  formatTimeText,
  monthCells,
  pad,
  type TimeFormat,
} from '@/lib/date-input'
import { MONTHS_LONG, WEEKDAYS_SHORT } from '@/lib/game-backend'
import { Icon } from '@/components/ui/Icon'
import styles from './Pickers.module.css'

// The browser's own pickers follow the OS locale (an AM/PM clock even when the form says 24 saat) and
// can't be styled, so the date and time fields open these instead. Typing in the field still works.

const WEEK = [...WEEKDAYS_SHORT.slice(1), WEEKDAYS_SHORT[0]] // Monday first
const ARROWS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

type PopoverProps = {
  id: string
  /** The field around the input, its button and the popover: presses and focus inside it keep it open. */
  anchor: RefObject<HTMLElement | null>
  /** Opened from its button, so focus moves in; opened by clicking the input, typing carries on. */
  autoFocus: boolean
  /** `refocus`: hand focus back to the button, because it was inside the popover. */
  onClose: (refocus: boolean) => void
}

/** Closes on Escape and on a press or focus outside `anchor`. */
function useDismiss(anchor: PopoverProps['anchor'], popover: RefObject<HTMLElement | null>, onClose: PopoverProps['onClose']) {
  useEffect(() => {
    const outside = (event: Event) => {
      if (!anchor.current?.contains(event.target as Node)) onClose(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose(popover.current?.contains(document.activeElement) ?? false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [anchor, popover, onClose])
}

/** Month grid from `today` onwards; arrow keys move between days, Enter picks. */
export function CalendarPopover({
  id,
  anchor,
  autoFocus,
  onClose,
  value,
  today,
  onSelect,
}: PopoverProps & { value: string; today: string; onSelect: (isoDate: string) => void }) {
  const root = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  useDismiss(anchor, root, onClose)

  const start = value && value >= today ? value : today
  const [month, setMonth] = useState(start.slice(0, 7))
  const [active, setActive] = useState(start) // the day Tab lands on
  const [slide, setSlide] = useState<'next' | 'prev' | null>(null)
  const pendingFocus = useRef(autoFocus)

  function turnTo(day: string) {
    const next = day.slice(0, 7)
    if (next !== month) setSlide(next > month ? 'next' : 'prev')
    setMonth(next)
    setActive(day)
  }

  // A date typed while the calendar is open turns it to that month.
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    if (value >= today) turnTo(value)
  }

  function changeMonth(by: number) {
    const next = addMonths(month, by)
    setSlide(by > 0 ? 'next' : 'prev')
    setMonth(next)
    setActive(`${next}-01` < today ? today : `${next}-01`)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const by = ARROWS[event.key]
    if (by === undefined) return
    event.preventDefault()
    const next = addDays(active, by)
    if (next < today) return
    pendingFocus.current = true
    turnTo(next)
  }

  useEffect(() => {
    if (!pendingFocus.current) return
    pendingFocus.current = false
    grid.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus()
  }, [active])

  const [year, monthIndex] = month.split('-').map(Number)
  const monthName = MONTHS_LONG[monthIndex - 1]

  return (
    <div ref={root} id={id} role="dialog" aria-label="Tarix seçin" tabIndex={-1} className={styles.popover}>
      <div className={styles.head}>
        <button
          type="button"
          className={`${styles.nav} ${styles.back}`}
          onClick={() => changeMonth(-1)}
          disabled={month <= today.slice(0, 7)}
          aria-label="Əvvəlki ay"
        >
          <Icon name="chevron" />
        </button>
        <p key={month} className={styles.monthTitle} aria-live="polite">
          {monthName} {year}
        </p>
        <button type="button" className={styles.nav} onClick={() => changeMonth(1)} aria-label="Növbəti ay">
          <Icon name="chevron" />
        </button>
      </div>

      <div className={styles.weekdays} aria-hidden="true">
        {WEEK.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div key={month} ref={grid} className={`${styles.days} ${slide ? styles[slide] : ''}`} onKeyDown={onKeyDown}>
        {monthCells(month).map((day, index) =>
          day === null ? (
            <span key={`blank-${index}`} />
          ) : (
            <button
              key={day}
              type="button"
              className={`${styles.day} ${day === today ? styles.today : ''}`}
              tabIndex={day === active ? 0 : -1}
              disabled={day < today}
              aria-pressed={day === value}
              aria-current={day === today ? 'date' : undefined}
              aria-label={`${Number(day.slice(8))} ${monthName} ${year}`}
              onClick={() => onSelect(day)}
            >
              {Number(day.slice(8))}
            </button>
          ),
        )}
      </div>

      <div className={styles.foot}>
        <button type="button" className={styles.chip} onClick={() => onSelect(today)}>
          Bu gün
        </button>
        <button type="button" className={styles.chip} onClick={() => onSelect(addDays(today, 1))}>
          Sabah
        </button>
      </div>
    </div>
  )
}

const MINUTES = Array.from({ length: 12 }, (_, index) => index * 5)
const HOURS_12 = Array.from({ length: 12 }, (_, index) => index || 12) // 12, 1, 2 … 11
const KEY_STEPS: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }

/**
 * A clock dial, as on Android: press or drag to an hour, let go and it turns to minutes, then picking a
 * minute is `done`. 24 saat has two rings (1–12 outside, 00 and 13–23 inside); 12 saat has one, with an
 * AM/PM switch. `onSelect` gets "HH:mm" either way. Times `isPast` says have gone are faded, and nothing
 * here ever picks one. From the keyboard the dial is a slider: arrows move, Enter picks.
 */
export function TimePopover({
  id,
  anchor,
  autoFocus,
  onClose,
  value,
  format,
  onSelect,
  isPast = () => false,
}: PopoverProps & {
  value: string
  format: TimeFormat
  onSelect: (time: string, done: boolean) => void
  /** Whether "HH:mm" on the chosen date has already gone. */
  isPast?: (time: string) => boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  const dial = useRef<HTMLDivElement>(null)
  useDismiss(anchor, root, onClose)

  const [hours, minutes] = value ? value.split(':').map(Number) : [null, null]
  // The half the 12-hour dial shows: the chosen time's, unless AM/PM was flipped to a half the time
  // can't move to. With nothing picked it starts on PM: most games are in the afternoon or evening.
  const [half, setHalf] = useState<'am' | 'pm' | null>(null)
  const pm = half ? half === 'pm' : hours === null || hours >= 12
  const showsValue = hours !== null && pm === hours >= 12
  const [chosenStep, setStep] = useState<'hour' | 'minute'>('hour')
  const step = showsValue ? chosenStep : 'hour'
  const current = !showsValue ? null : step === 'hour' ? hours : minutes
  // The number the pointer is on during a press, if it can be picked; letting go picks it.
  const pressed = useRef<number | null>(null)

  useEffect(() => {
    if (autoFocus) dial.current?.focus()
  }, [autoFocus])

  // The hand turns the short way round, so 55 → 00 is one step on, not a lap back.
  const target = current === null ? null : step === 'hour' ? (current % 12) * 30 : current * 6
  const [angle, setAngle] = useState(target ?? 0)
  if (target !== null && (angle - target) % 360 !== 0) {
    setAngle(angle + ((((target - angle) % 360) + 540) % 360) - 180)
  }

  function choosePm(next: boolean) {
    const flipped = hours === null ? null : `${pad((hours % 12) + (next ? 12 : 0))}:${pad(minutes ?? 0)}`
    // The time moves to the other half, unless it has gone there: then only the grid switches.
    if (flipped && !isPast(flipped)) {
      setHalf(null)
      onSelect(flipped, false)
    } else {
      setHalf(next ? 'pm' : 'am')
    }
  }

  // An hour has gone once its last slot (:55) has.
  const marks =
    step === 'minute'
      ? MINUTES.map((minute) => ({
          value: minute,
          label: pad(minute),
          ring: DIAL_RINGS.outer,
          past: isPast(`${pad(hours!)}:${pad(minute)}`),
        }))
      : [
          ...HOURS_12.map((hour) => (format === '24h' ? hour : (hour % 12) + (pm ? 12 : 0))),
          ...(format === '24h' ? HOURS_12.map((hour) => (hour + 12) % 24) : []),
        ].map((hour, index) => ({
          value: hour,
          label: index < 12 ? String(hour % 12 || 12) : pad(hour),
          ring: index < 12 ? DIAL_RINGS.outer : DIAL_RINGS.inner,
          past: isPast(`${pad(hour)}:55`),
        }))
  const hand = marks.find((mark) => mark.value === current)?.ring ?? DIAL_RINGS.outer

  function select(choice: number) {
    if (step === 'hour') {
      // The minutes picked so far stay, unless that time has gone: then the first minute left in the hour.
      const kept = minutes ?? 0
      const minute = isPast(`${pad(choice)}:${pad(kept)}`)
        ? (MINUTES.find((m) => !isPast(`${pad(choice)}:${pad(m)}`)) ?? kept)
        : kept
      setHalf(null)
      onSelect(`${pad(choice)}:${pad(minute)}`, false)
    } else {
      onSelect(`${pad(hours!)}:${pad(choice)}`, false)
    }
  }

  /** The hour is kept and the dial turns to minutes; a minute finishes. */
  function pick(choice: number) {
    if (step === 'hour') setStep('minute')
    else onSelect(`${pad(hours!)}:${pad(choice)}`, true)
  }

  function pointAt(event: React.PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const radius = box.width / 2
    const x = (event.clientX - box.left) / radius - 1
    const y = (event.clientY - box.top) / radius - 1
    const choice = dialValue(x, y, step, format, pm)
    if (marks.find((mark) => mark.value === choice)?.past !== false) return
    pressed.current = choice
    if (choice !== current) select(choice)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (current !== null) pick(current)
      return
    }
    const by = KEY_STEPS[event.key]
    if (by === undefined) return
    event.preventDefault()
    const open = marks.filter((mark) => !mark.past).map((mark) => mark.value).sort((a, b) => a - b)
    if (!open.length) return
    const next =
      current === null
        ? open[0]
        : by > 0
          ? (open.find((choice) => choice > current) ?? open[0])
          : (open.findLast((choice) => choice < current) ?? open[open.length - 1])
    select(next)
  }

  const hourText = hours === null || !showsValue ? '--' : format === '24h' ? pad(hours) : String(hours % 12 || 12)

  return (
    <div ref={root} id={id} role="dialog" aria-label="Saat seçin" tabIndex={-1} className={styles.popover}>
      <div
        ref={dial}
        className={styles.dial}
        role="slider"
        tabIndex={0}
        aria-label={step === 'hour' ? 'Saat' : 'Dəqiqə'}
        aria-valuemin={0}
        aria-valuemax={step === 'hour' ? 23 : 59}
        aria-valuenow={current ?? undefined}
        aria-valuetext={showsValue ? formatTimeText(value, format) : undefined}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          pressed.current = null
          pointAt(event)
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) pointAt(event)
        }}
        onPointerUp={() => {
          if (pressed.current !== null) pick(pressed.current)
          pressed.current = null
        }}
        onPointerCancel={() => (pressed.current = null)}
      >
        {current !== null && (
          <span
            className={styles.hand}
            data-between={step === 'minute' && current % 5 !== 0 ? '' : undefined}
            style={{ height: `${hand * 50}%`, transform: `rotate(${angle}deg)` }}
          />
        )}
        <div key={step} className={styles.marks} aria-hidden="true">
          {marks.map((mark) => {
            const turn = ((step === 'hour' ? (mark.value % 12) * 30 : mark.value * 6) * Math.PI) / 180
            return (
              <span
                key={mark.label}
                className={`${styles.mark} ${mark.ring === DIAL_RINGS.inner ? styles.inner : ''}`}
                data-chosen={mark.value === current ? '' : undefined}
                data-past={mark.past ? '' : undefined}
                style={{ left: `${50 + 50 * mark.ring * Math.sin(turn)}%`, top: `${50 - 50 * mark.ring * Math.cos(turn)}%` }}
              >
                {mark.label}
              </span>
            )
          })}
        </div>
      </div>

      <div className={`${styles.head} ${styles.readout}`}>
        <div className={styles.display}>
          <button
            type="button"
            className={styles.part}
            aria-pressed={step === 'hour'}
            onClick={() => setStep('hour')}
            aria-label="Saatı seç"
          >
            {hourText}
          </button>
          <span className={styles.colon} aria-hidden="true">
            :
          </span>
          <button
            type="button"
            className={styles.part}
            aria-pressed={step === 'minute'}
            onClick={() => setStep('minute')}
            disabled={!showsValue}
            aria-label="Dəqiqəni seç"
          >
            {minutes === null || !showsValue ? '--' : pad(minutes)}
          </button>
        </div>
        {format === '12h' && (
          <div className={`${styles.toggle} ${styles.toggleOnDark}`} role="radiogroup" aria-label="Günün yarısı">
            {(['AM', 'PM'] as const).map((label) => (
              <label key={label} className={styles.toggleOption}>
                <input
                  type="radio"
                  name={`${id}-meridiem`}
                  checked={pm === (label === 'PM')}
                  onChange={() => choosePm(label === 'PM')}
                  disabled={isPast(label === 'PM' ? '23:55' : '11:55')}
                />
                {label}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
