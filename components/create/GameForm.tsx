'use client'

import { useRouter } from 'next/navigation'
import { useId, useRef, useState } from 'react'

import { apiFetch, ApiError, patchJson, postJson } from '@/lib/api-client'
import type { CreateGameRequest, CurrentUser, GameDetail, Venue } from '@/lib/api-types'
import {
  DATE_FORMATS,
  formatDateInput,
  formatDateText,
  formatTimeText,
  parseDateText,
  parseTimeText,
  formatTimeInput,
  TIME_FORMATS,
  type DateFormat,
  type TimeFormat,
} from '@/lib/date-input'
import {
  BAKU_UTC_OFFSET,
  formatBakuDateKey,
  formatBakuTime,
  MIN_MAX_PLAYERS,
  normalizePhone,
  PLAYER_COUNT_STEP,
  SPORT_META,
} from '@/lib/game-backend'
import { formatLocalPhone, PHONE_ERROR, PHONE_PREFIX } from '@/lib/phone'
import { phoneSource, type PhoneSource } from '@/lib/profile-form'
import { loginHref } from '@/lib/safe-redirect'
import { expireSession } from '@/lib/session-actions'
import { LEVEL_OPTIONS, SPORT_EMOJI, SPORT_LABELS, SPORT_ORDER } from '@/components/games/sports'
import { buttonClass } from '@/components/ui/button'
import form from '@/components/ui/form.module.css'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { PhoneInput } from '@/components/ui/PhoneInput'
import { PhoneProfileNote } from '@/components/ui/PhoneProfileNote'
import danger from '@/components/ui/danger.module.css'
import styles from './GameForm.module.css'
import { CalendarPopover, TimePopover } from './Pickers'
import pickers from './Pickers.module.css'
import { VenuePicker } from './VenuePicker'

type Field = 'hostPhone' | 'venue' | 'date' | 'time' | 'currentCount' | 'maxCount' | 'title'
type Errors = Partial<Record<Field, string>>

const MAX_COUNT_ERROR = 'Maksimum iştirakçı sayı cüt olmalı və bu idman növünün limitini keçməməlidir.'
const CURRENT_COUNT_ERROR = 'Mövcud iştirakçı sayı ən azı 1 (siz) olmalı və maksimumdan az olmalıdır.'

/** API error codes of `POST /api/v1/games` → the field they belong to and an Azerbaijani message. */
const API_ERRORS: Record<string, { field?: Field; message: string }> = {
  INVALID_VENUE: { field: 'venue', message: 'Meydança seçin.' },
  VENUE_NOT_FOUND: { field: 'venue', message: 'Meydança tapılmadı. Başqa meydança seçin.' },
  VENUE_SPORT_MISMATCH: { field: 'venue', message: 'Bu meydançada seçilmiş idman növü oynanmır.' },
  INVALID_DATE: { field: 'date', message: 'Tarix və saatı daxil edin.' },
  DATE_IN_PAST: { field: 'time', message: 'Oyunun vaxtı gələcəkdə olmalıdır.' },
  INVALID_MAX_COUNT: { field: 'maxCount', message: MAX_COUNT_ERROR },
  INVALID_CURRENT_COUNT: { field: 'currentCount', message: CURRENT_COUNT_ERROR },
  INVALID_PHONE: { field: 'hostPhone', message: PHONE_ERROR },
  PHONE_REQUIRED: { field: 'hostPhone', message: 'Host telefon nömrəsi tələb olunur.' },
  MAX_COUNT_BELOW_PLAYERS: { field: 'maxCount', message: 'Oyunda artıq bu qədər oyunçu var — limiti aşağı sala bilməzsiniz.' },
  NOT_GAME_HOST: { message: 'Yalnız oyunun hostu bu oyunu dəyişə bilər.' },
  GAME_STARTED: { message: 'Oyun artıq başlayıb — onu dəyişmək və ya silmək mümkün deyil.' },
  GAME_NOT_FOUND: { message: 'Oyun tapılmadı.' },
  INVALID_SPORT: { message: 'İdman növünü seçin.' },
  INVALID_LEVEL: { message: 'Oyun səviyyəsini seçin.' },
}

/** Smallest legal "maksimum" for a game: even, and never below the players already in it. */
function minMaxFor(currentCount: number) {
  return Math.max(MIN_MAX_PLAYERS, Math.ceil(currentCount / PLAYER_COUNT_STEP) * PLAYER_COUNT_STEP)
}

function venueOffers(venue: Venue, sport: string) {
  return venue.sportTypes.length === 0 || venue.sportTypes.includes(sport)
}

/** Whether a Baku-local date ("2026-09-19") and time ("19:30") has already passed. */
function hasPassed(date: string, time: string) {
  return new Date(`${date}T${time}:00${BAKU_UTC_OFFSET}`).getTime() <= Date.now()
}

/** − value + control for a player count. The <output> announces each new value to screen readers. */
function Stepper({
  id,
  value,
  min,
  max,
  step,
  onChange,
  describedBy,
}: {
  id: string
  value: number
  min: number
  max: number
  step: number
  onChange: (next: number) => void
  describedBy?: string
}) {
  return (
    <div className={styles.stepper}>
      <button
        type="button"
        className={styles.stepButton}
        onClick={() => onChange(value - step)}
        disabled={value - step < min}
        aria-label={`${step} nəfər azalt`}
      >
        −
      </button>
      <output id={id} className={styles.stepValue} aria-describedby={describedBy}>
        {value}
      </output>
      <button
        type="button"
        className={styles.stepButton}
        onClick={() => onChange(value + step)}
        disabled={value + step > max}
        aria-label={`${step} nəfər artır`}
      >
        +
      </button>
    </div>
  )
}

/**
 * "Yeni Oyun Yarat": a single column of full-width cards with "Oyunu dərc et" underneath.
 * All form state lives here, so sport and level selection have one source of truth.
 */
export function GameForm({
  user,
  today,
  initialSport,
  game,
}: {
  user: CurrentUser
  today: string
  initialSport?: string
  /** Set to edit that game instead of creating one. Only its host ever gets this far. */
  game?: GameDetail
}) {
  const editing = game !== undefined
  const router = useRouter()
  const baseId = useId()
  const ids = Object.fromEntries(
    ['name', 'phone', 'date', 'time', 'current', 'max', 'title', 'venue', 'incomplete'].map((key) => [
      key,
      `${baseId}-${key}`,
    ]),
  ) as Record<'name' | 'phone' | 'date' | 'time' | 'current' | 'max' | 'title' | 'venue' | 'incomplete', string>

  const [sport, setSport] = useState(
    game?.sport ?? (initialSport && SPORT_ORDER.includes(initialSport) ? initialSport : 'football'),
  )
  const [level, setLevel] = useState(game?.level ?? 'medium')
  const [venue, setVenue] = useState<Venue | null>(game?.venue ?? null)
  // Date and time are kept as typed; the API values ("2026-09-19", "19:30") are derived from the text
  // and the chosen format, so switching format or picking from the calendar just rewrites the text.
  const [dateFormat, setDateFormat] = useState<DateFormat>('dd.mm.yyyy')
  const [dateText, setDateText] = useState(() =>
    formatDateText(game?.startsAt ? formatBakuDateKey(new Date(game.startsAt)) : today, 'dd.mm.yyyy'),
  )
  const [timeFormat, setTimeFormat] = useState<TimeFormat>('24h')
  const [timeText, setTimeText] = useState(() =>
    game?.startsAt ? formatTimeText(formatBakuTime(game.startsAt) ?? '', '24h') : '',
  )
  const date = parseDateText(dateText, dateFormat) ?? ''
  const time = parseTimeText(timeText, timeFormat) ?? ''
  // Which popover is open, and whether it was opened from its button (so focus moves into it).
  const [picker, setPicker] = useState<{ field: 'date' | 'time'; fromButton: boolean } | null>(null)
  const dateField = useRef<HTMLDivElement>(null)
  const timeField = useRef<HTMLDivElement>(null)
  const dateButton = useRef<HTMLButtonElement>(null)
  const timeButton = useRef<HTMLButtonElement>(null)
  // The host is the first player, so at least one spot is taken.
  // Both counts are set with − / + steppers only, so they are always in range: current from 1 to
  // maxCount − 1, max even and within the sport's limit.
  // When editing, the count is whoever has joined by now and is not the host's to set.
  const [currentCount, setCurrentCount] = useState(game?.currentCount ?? 1)
  const [maxCount, setMaxCount] = useState(() => game?.maxCount ?? SPORT_META[sport].maxPlayers)
  const sportMax = SPORT_META[sport].maxPlayers
  const minMaxCount = editing ? minMaxFor(currentCount) : MIN_MAX_PLAYERS
  // Only the digits after the fixed +994 prefix, formatted as "77 538 60 04".
  const [hostPhone, setHostPhone] = useState(formatLocalPhone(game?.host.phone ?? user.phoneNumber ?? ''))
  // Creating remembers the number on the profile (see PhoneProfileNote); editing a game's number doesn't.
  const phoneNote: PhoneSource = editing ? 'none' : phoneSource(user.phoneNumber, hostPhone)
  const [savePhone, setSavePhone] = useState(false)
  const [title, setTitle] = useState(game?.title ?? '')

  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // "Oyunu dərc et" stays disabled until every required field has a value; formats are checked on submit.
  const complete = Boolean(hostPhone.trim() && venue && dateText.trim() && timeText.trim())

  function chooseSport(next: string) {
    setSport(next)
    // A venue that doesn't host the new sport would be rejected by the API.
    if (venue && !venueOffers(venue, next)) setVenue(null)
    // Each sport has its own limit (football 22, basketball 10, tennis 4); start from the full size.
    changeMaxCount(SPORT_META[next].maxPlayers)
  }

  /** "Mövcud iştirakçı sayı" follows the max down when it would no longer leave a free spot. */
  function changeMaxCount(next: number) {
    setMaxCount(editing ? Math.max(next, minMaxFor(currentCount)) : next)
    // While editing, who is in the game is fixed; only the free spots move.
    if (!editing) setCurrentCount((current) => Math.min(current, next - 1))
    setErrors((current) => ({ ...current, maxCount: undefined, currentCount: undefined }))
  }

  function dateError() {
    if (!dateText.trim()) return 'Tarixi yazın və ya təqvimdən seçin.'
    if (!date) return `Tarixi ${DATE_FORMATS[dateFormat].label} formatında yazın.`
    if (date < today) return 'Keçmiş tarix seçilə bilməz.'
  }

  function timeError() {
    if (!timeText.trim()) return 'Saatı yazın və ya seçin.'
    if (!time) return `Saatı ${TIME_FORMATS[timeFormat].example} formatında yazın.`
    if (date && hasPassed(date, time)) return 'Oyunun vaxtı gələcəkdə olmalıdır.'
  }

  /** On leaving a typed field: tidy a valid value into the chosen format ("19.9.26" → "19.09.2026"), else flag it. */
  function tidyDate() {
    if (date) setDateText(formatDateText(date, dateFormat))
    const problem = dateText.trim() ? dateError() : undefined
    if (problem) setErrors((current) => ({ ...current, date: problem }))
  }

  function tidyTime() {
    if (time) setTimeText(formatTimeText(time, timeFormat))
    const problem = timeText.trim() ? timeError() : undefined
    if (problem) setErrors((current) => ({ ...current, time: problem }))
  }

  /** Rewrites a valid value in the new format; half-typed text is re-masked so its separators follow too. */
  function changeDateFormat(next: DateFormat) {
    setDateText(date ? formatDateText(date, next) : formatDateInput(dateText, next))
    setDateFormat(next)
    setErrors((current) => ({ ...current, date: undefined }))
  }

  function changeTimeFormat(next: TimeFormat) {
    if (time) setTimeText(formatTimeText(time, next))
    setTimeFormat(next)
    setErrors((current) => ({ ...current, time: undefined }))
  }

  function togglePicker(field: 'date' | 'time') {
    setPicker((current) => (current?.field === field ? null : { field, fromButton: true }))
  }

  function closePicker(refocus: boolean) {
    const button = picker?.field === 'date' ? dateButton.current : timeButton.current
    setPicker(null)
    if (refocus) button?.focus()
  }

  function validate(): Errors {
    const found: Errors = {}
    if (!normalizePhone(`${PHONE_PREFIX}${hostPhone}`)) {
      found.hostPhone = hostPhone.trim() ? PHONE_ERROR : 'Host telefon nömrəsi tələb olunur.'
    }
    if (!venue?.id) found.venue = 'Meydança seçin.'
    const dateProblem = dateError()
    if (dateProblem) found.date = dateProblem
    const timeProblem = timeError()
    if (timeProblem) found.time = timeProblem
    return found
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) {
      // Submit is a discrete event, so React has committed the error state by the next frame.
      const formElement = event.currentTarget
      requestAnimationFrame(() => formElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }

    const body: CreateGameRequest = {
      sport,
      level,
      venueId: Number(venue!.id),
      scheduledDate: date,
      scheduledTime: time,
      currentCount,
      maxCount,
      hostPhone: `${PHONE_PREFIX} ${hostPhone}`,
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(phoneNote === 'differs' && savePhone ? { saveToProfile: true } : {}),
    }

    setPending(true)
    try {
      const saved = editing
        ? await patchJson<{ game: GameDetail; savedToProfile?: boolean }>(`/api/v1/games/${game.id}`, body)
        : await postJson<{ game: GameDetail; savedToProfile?: boolean }>('/api/v1/games', body)
      // The number is the profile's now: the header and the next form must not keep the old one.
      if (saved.savedToProfile) await expireSession()
      router.push(`/games/${saved.game.id}`)
      router.refresh()
    } catch (err) {
      setPending(false)
      if (err instanceof ApiError && err.code === 'UNAUTHENTICATED') {
        router.push(loginHref(editing ? `/games/${game.id}/edit` : '/games/new'))
        return
      }
      const known = err instanceof ApiError ? API_ERRORS[err.code] : undefined
      const fallback = editing ? 'Oyunu yeniləmək mümkün olmadı.' : 'Oyun yaratmaq mümkün olmadı.'
      if (known?.field) setErrors({ [known.field]: known.message })
      else setFormError(known?.message ?? (err instanceof Error ? err.message : fallback))
    }
  }

  async function remove() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await apiFetch(`/api/v1/games/${game!.id}`, { method: 'DELETE' })
      setConfirmOpen(false)
      // Back to the homepage: the game this page was editing no longer exists.
      router.replace('/')
      router.refresh()
    } catch (err) {
      setDeleting(false)
      const known = err instanceof ApiError ? API_ERRORS[err.code] : undefined
      setDeleteError(known?.message ?? (err instanceof Error ? err.message : 'Oyunu silmək mümkün olmadı.'))
    }
  }

  /** Updates a field and drops its error, so a corrected field stops showing the old message. */
  const edit = (field: Field, set: (value: string) => void) => (event: React.ChangeEvent<HTMLInputElement>) => {
    set(event.target.value)
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const invalid = (field: Field) => (errors[field] ? true : undefined)
  const describe = (field: Field, id: string) => (errors[field] ? `${id}-error` : undefined)
  const fieldError = (field: Field, id: string) =>
    errors[field] ? (
      <p id={`${id}-error`} className={form.fieldError}>
        {errors[field]}
      </p>
    ) : null


  const formBody = (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.main}>
        <section className={styles.section} aria-labelledby="host-section">
          <h2 id="host-section" className="visually-hidden">
            Host məlumatları
          </h2>
          <div className={form.row}>
            <div className={form.field}>
              <label htmlFor={ids.name} className={form.labelSmall}>
                Ad Soyad (Host)
              </label>
              <input id={ids.name} className={`${form.input} ${form.inputCompact}`} value={user.fullName} readOnly />
            </div>
            <div className={form.field}>
              <label htmlFor={ids.phone} className={form.labelSmall}>
                Host telefon nömrəsi
              </label>
              <PhoneInput
                id={ids.phone}
                compact
                value={hostPhone}
                onChange={(value) => {
                  setHostPhone(value)
                  if (errors.hostPhone) setErrors((current) => ({ ...current, hostPhone: undefined }))
                }}
                required
                invalid={invalid('hostPhone')}
                describedBy={[phoneNote === 'none' ? '' : `${ids.phone}-note`, describe('hostPhone', ids.phone)]
                  .filter(Boolean)
                  .join(' ')}
              />
              <PhoneProfileNote
                id={`${ids.phone}-note`}
                source={phoneNote}
                save={savePhone}
                onSaveChange={setSavePhone}
              />
              {fieldError('hostPhone', ids.phone)}
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="game-section">
          <h2 id="game-section" className="visually-hidden">
            Oyun məlumatları
          </h2>

          <fieldset className={form.field}>
            <legend className={form.labelSmall} style={{ marginBottom: 8 }}>
              İdman növü
            </legend>
            <div className={styles.choices}>
              {SPORT_ORDER.map((value) => (
                <label key={value} className={`${styles.choice} ${styles.sportChoice}`}>
                  <input
                    type="radio"
                    name="sport"
                    value={value}
                    checked={sport === value}
                    onChange={() => chooseSport(value)}
                  />
                  <span className={styles.emoji} aria-hidden="true">
                    {SPORT_EMOJI[value]}
                  </span>
                  <span className={styles.choiceLabel}>{SPORT_LABELS[value]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <VenuePicker
            sport={sport}
            value={venue}
            onChange={(next) => {
              setVenue(next)
              setErrors((current) => ({ ...current, venue: undefined }))
            }}
            error={errors.venue}
            errorId={`${ids.venue}-error`}
          />

          <div className={form.row}>
            {/* Typed text fields with a format picker; the button (or a click in the field) opens a popover. */}
            <div className={form.field}>
              <div className={styles.labelRow}>
                <label htmlFor={ids.date} className={form.labelSmall}>
                  Tarix
                </label>
                <span className={pickers.select}>
                  <select
                    aria-label="Tarix formatı"
                    value={dateFormat}
                    onChange={(event) => changeDateFormat(event.target.value as DateFormat)}
                  >
                    {Object.entries(DATE_FORMATS).map(([value, { label }]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </span>
              </div>
              <div ref={dateField} className={form.inputWrap}>
                <input
                  id={ids.date}
                  className={`${form.input} ${form.inputCompact} ${form.withIcon}`}
                  autoComplete="off"
                  placeholder={DATE_FORMATS[dateFormat].label}
                  value={dateText}
                  onChange={edit('date', (value) => setDateText(formatDateInput(value, dateFormat)))}
                  onClick={() => setPicker({ field: 'date', fromButton: false })}
                  onBlur={tidyDate}
                  required
                  aria-invalid={invalid('date')}
                  aria-describedby={describe('date', ids.date)}
                />
                <button
                  ref={dateButton}
                  type="button"
                  className={styles.pickerButton}
                  onClick={() => togglePicker('date')}
                  aria-label="Təqvimdən seç"
                  aria-haspopup="dialog"
                  aria-expanded={picker?.field === 'date'}
                  aria-controls={`${ids.date}-picker`}
                >
                  <Icon name="calendar" />
                </button>
                {picker?.field === 'date' && (
                  <CalendarPopover
                    id={`${ids.date}-picker`}
                    anchor={dateField}
                    autoFocus={picker.fromButton}
                    onClose={closePicker}
                    value={date}
                    today={today}
                    onSelect={(next) => {
                      setDateText(formatDateText(next, dateFormat))
                      setErrors((current) => ({ ...current, date: undefined }))
                      closePicker(true)
                    }}
                  />
                )}
              </div>
              {fieldError('date', ids.date)}
            </div>
            <div className={form.field}>
              <div className={styles.labelRow}>
                <label htmlFor={ids.time} className={form.labelSmall}>
                  Saat
                </label>
                <div className={pickers.toggle} role="radiogroup" aria-label="Saat formatı">
                  {Object.entries(TIME_FORMATS).map(([value, { label }]) => (
                    <label key={value} className={pickers.toggleOption}>
                      <input
                        type="radio"
                        name={`${ids.time}-format`}
                        value={value}
                        checked={timeFormat === value}
                        onChange={() => changeTimeFormat(value as TimeFormat)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div ref={timeField} className={form.inputWrap}>
                <input
                  id={ids.time}
                  className={`${form.input} ${form.inputCompact} ${form.withIcon}`}
                  autoComplete="off"
                  placeholder={`məs. ${TIME_FORMATS[timeFormat].example}`}
                  value={timeText}
                  onChange={edit('time', (value) => setTimeText(formatTimeInput(value)))}
                  onClick={() => setPicker({ field: 'time', fromButton: false })}
                  onBlur={tidyTime}
                  required
                  aria-invalid={invalid('time')}
                  aria-describedby={describe('time', ids.time)}
                />
                <button
                  ref={timeButton}
                  type="button"
                  className={styles.pickerButton}
                  onClick={() => togglePicker('time')}
                  aria-label="Saatı seç"
                  aria-haspopup="dialog"
                  aria-expanded={picker?.field === 'time'}
                  aria-controls={`${ids.time}-picker`}
                >
                  <Icon name="clock" />
                </button>
                {picker?.field === 'time' && (
                  <TimePopover
                    id={`${ids.time}-picker`}
                    anchor={timeField}
                    autoFocus={picker.fromButton}
                    onClose={closePicker}
                    value={time}
                    format={timeFormat}
                    isPast={(candidate) => date !== '' && hasPassed(date, candidate)}
                    onSelect={(next, done) => {
                      setTimeText(formatTimeText(next, timeFormat))
                      setErrors((current) => ({ ...current, time: undefined }))
                      if (done) closePicker(true)
                    }}
                  />
                )}
              </div>
              {fieldError('time', ids.time)}
            </div>
          </div>

          <div className={styles.counts}>
            <div className={form.field}>
              <label htmlFor={ids.current} className={form.labelSmall}>
                Mövcud iştirakçı sayı
              </label>
              {editing ? (
                <>
                  {/* Who is in the game is decided by who joined, not by the host editing a number. */}
                  <output id={ids.current} className={styles.readOnlyCount}>
                    {currentCount}
                  </output>
                  <p id={`${ids.current}-hint`} className={form.hint}>
                    Qoşulan oyunçular · dəyişdirilə bilməz
                  </p>
                </>
              ) : (
                <>
                  {/* From 1 (the host) up to one below the max, so at least one spot stays free. */}
                  <Stepper
                    id={ids.current}
                    value={currentCount}
                    min={1}
                    max={maxCount - 1}
                    step={1}
                    onChange={(next) => {
                      setCurrentCount(next)
                      setErrors((current) => ({ ...current, currentCount: undefined }))
                    }}
                    describedBy={[`${ids.current}-hint`, describe('currentCount', ids.current)]
                      .filter(Boolean)
                      .join(' ')}
                  />
                  <p id={`${ids.current}-hint`} className={form.hint}>
                    Siz də daxil olmaqla
                  </p>
                  {fieldError('currentCount', ids.current)}
                </>
              )}
            </div>
            <div className={form.field}>
              <label htmlFor={ids.max} className={form.labelSmall}>
                Maksimum iştirakçı sayı
              </label>
              {/* Two equal sides, so it moves by 2. */}
              <Stepper
                id={ids.max}
                value={maxCount}
                min={minMaxCount}
                max={sportMax}
                step={PLAYER_COUNT_STEP}
                onChange={changeMaxCount}
                describedBy={[`${ids.max}-hint`, describe('maxCount', ids.max)].filter(Boolean).join(' ')}
              />
              <p id={`${ids.max}-hint`} className={form.hint}>
                Hər tərəfdə {maxCount / 2} nəfər · {SPORT_LABELS[sport]} üçün maksimum {sportMax}
                {editing ? ` · ən az ${minMaxCount} (qoşulanlar)` : ''}
              </p>
              {fieldError('maxCount', ids.max)}
            </div>
          </div>

          <fieldset className={form.field}>
            <legend className={form.labelSmall} style={{ marginBottom: 8 }}>
              Oyun Səviyyəsi
            </legend>
            <div className={`${styles.choices} ${styles.levels}`}>
              {LEVEL_OPTIONS.map((option) => (
                <label key={option.value} className={`${styles.choice} ${styles.levelChoice}`}>
                  <input
                    type="radio"
                    name="level"
                    value={option.value}
                    checked={level === option.value}
                    onChange={() => setLevel(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className={form.field}>
            <label htmlFor={ids.title} className={form.labelSmall}>
              Oyunun adı (istəyə bağlı)
            </label>
            <input
              id={ids.title}
              className={`${form.input} ${form.inputCompact}`}
              maxLength={120}
              placeholder={`məs. Cümə axşamı 5-ə-5 — boş qalsa “${SPORT_LABELS[sport]} oyunu”`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
        </section>
      </div>

      <div className={styles.submit}>
        {formError && (
          <p className={form.alert} role="alert">
            {formError}
          </p>
        )}
        {Object.values(errors).some(Boolean) && !formError && (
          <p className="visually-hidden" role="alert">
            Formda səhvlər var. Qeyd olunan xanaları düzəldin.
          </p>
        )}
        <button
          type="submit"
          className={buttonClass('primary', 'xl', { block: true })}
          disabled={pending || !complete}
          aria-busy={pending}
          aria-describedby={complete ? undefined : ids.incomplete}
        >
          {editing
            ? pending
              ? 'Yadda saxlanılır…'
              : 'Dəyişiklikləri yadda saxla'
            : pending
              ? 'Dərc olunur…'
              : 'Oyunu dərc et'}
        </button>
        {!complete && (
          <p id={ids.incomplete} className={form.hint}>
            {editing
              ? 'Yadda saxlamaq üçün bütün məcburi xanaları doldurun.'
              : 'Dərc etmək üçün bütün məcburi xanaları doldurun.'}
          </p>
        )}
      </div>
    </form>
  )

  if (!editing) return formBody

  return (
    <>
      {formBody}
      <section className={danger.dangerZone} aria-labelledby="danger-zone">
        <h2 id="danger-zone" className={danger.dangerTitle}>
          Oyunu sil
        </h2>
        <p className={danger.dangerText}>
          Oyun birdəfəlik silinir və qoşulan {game.currentCount} oyunçu yerini itirir. Bu əməliyyat geri qaytarıla
          bilməz.
        </p>
        {deleteError && !confirmOpen && (
          <p className={form.alert} role="alert">
            {deleteError}
          </p>
        )}
        <button
          type="button"
          className={buttonClass('danger', 'lg', { className: danger.dangerButton })}
          onClick={() => {
            setDeleteError(null)
            setConfirmOpen(true)
          }}
          aria-haspopup="dialog"
        >
          Oyunu sil
        </button>
      </section>

      <Modal
        open={confirmOpen}
        onClose={() => {
          if (!deleting) setConfirmOpen(false)
        }}
        title="Oyunu silmək istəyirsiniz?"
      >
        <div className={danger.confirm}>
          <p className={danger.dangerText}>
            <strong>{game.title}</strong> silinəcək və qoşulan {game.currentCount} oyunçu yerini itirəcək. Bu
            əməliyyat geri qaytarıla bilməz.
          </p>
          {deleteError && (
            <p className={form.alert} role="alert">
              {deleteError}
            </p>
          )}
          <div className={danger.confirmActions}>
            {/* Focus starts on the way out, so Enter never deletes a game by accident. */}
            <button
              type="button"
              className={buttonClass('muted', 'lg')}
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
              data-autofocus
            >
              İmtina et
            </button>
            <button
              type="button"
              className={buttonClass('danger', 'lg')}
              onClick={remove}
              disabled={deleting}
              aria-busy={deleting}
            >
              {deleting ? 'Silinir…' : 'Bəli, sil'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
