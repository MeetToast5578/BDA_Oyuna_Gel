'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, useTransition } from 'react'

import { ApiError, apiFetch, postJson } from '@/lib/api-client'
import type { CurrentUser, GameDetail } from '@/lib/api-types'
import { isUpcoming, normalizePhone, placeLabel } from '@/lib/game-backend'
import { formatLocalPhone, PHONE_ERROR, PHONE_PREFIX } from '@/lib/phone'
import { phoneSource, type PhoneSource } from '@/lib/profile-form'
import type { Side, SideChoice } from '@/lib/team-logic'
import { loginHref } from '@/lib/safe-redirect'
import { expireSession } from '@/lib/session-actions'
import choices from '@/components/create/GameForm.module.css'
import { buttonClass } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import form from '@/components/ui/form.module.css'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { PhoneInput } from '@/components/ui/PhoneInput'
import { PhoneProfileNote } from '@/components/ui/PhoneProfileNote'
import styles from './JoinPanel.module.css'
import { LeaveGame } from './LeaveGame'
import { STATUS_LABELS } from './sports'

/** Errors after which the page data is stale (spot taken, already a player, game closed). */
const REFRESH_ON = new Set(['ALREADY_JOINED', 'GAME_FULL', 'GAME_NOT_JOINABLE', 'SIDE_FULL'])

const NAME_ERROR = 'Ad və soyadınızı daxil edin.'

const SIDE_OPTIONS: { value: SideChoice; label: string }[] = [
  { value: 'home', label: 'A komandası' },
  { value: 'away', label: 'B komandası' },
  { value: 'random', label: 'Təsadüfi' },
]

/**
 * The join button and the join modal: name and phone (prefilled from the profile) and a side, then
 * "Qoşul" calls `POST /api/v1/games/{id}/join`. On success the modal closes and the page refreshes,
 * which shows the new player count and reveals the host's phone.
 */
export function JoinPanel({
  game,
  user,
  autoOpen,
  initialSide,
}: {
  game: GameDetail
  user: CurrentUser | null
  autoOpen: boolean
  /** From a link to one side (`?side=`); "Təsadüfi" without one. */
  initialSide?: Side
}) {
  const router = useRouter()
  const pathname = usePathname()
  const id = useId()

  const canJoin = game.status === 'open' && !game.viewer.joined && !game.viewer.isHost
  const [open, setOpen] = useState(autoOpen && canJoin && Boolean(user))
  // The same name-and-phone form serves "Qoşul" and, for a full game, "Gözləmə siyahısına yaz".
  const [mode, setMode] = useState<'join' | 'waitlist'>('join')
  // Prefilled from the profile, but the player can give a different name or number for this game.
  const [name, setName] = useState(user?.fullName ?? '')
  const [phone, setPhone] = useState(formatLocalPhone(user?.phoneNumber ?? ''))
  const phoneNote: PhoneSource = user ? phoneSource(user.phoneNumber, phone) : 'none'
  const [savePhone, setSavePhone] = useState(false)
  const [side, setSide] = useState<SideChoice>(initialSide ?? 'random')
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [confirmLeaveList, setConfirmLeaveList] = useState(false)
  // Set the moment the join succeeds, so the button can't be pressed again while the page refreshes.
  const [justJoined, setJustJoined] = useState(false)
  // Announced here rather than by LeaveGame, which is gone once the page shows "Qoşul" again.
  const [leftMessage, setLeftMessage] = useState('')
  const [, startRefresh] = useTransition()
  const joined = game.viewer.joined || justJoined
  // The "Qoşul" button is gone once joined; focus moves to the message that replaces it.
  const joinedNote = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (justJoined) joinedNote.current?.focus()
  }, [justJoined])

  // Drop ?join=1 so a reload doesn't reopen the modal.
  useEffect(() => {
    if (autoOpen) window.history.replaceState(null, '', pathname)
  }, [autoOpen, pathname])

  const joinUrl = `${pathname}?join=1${initialSide ? `&side=${initialSide}` : ''}`

  function openModal(next: 'join' | 'waitlist' = 'join') {
    if (!user) {
      router.push(loginHref(joinUrl))
      return
    }
    setMode(next)
    setErrors({})
    setError(null)
    setOpen(true)
  }

  /** Checks the fields here first, then joins (or signs up for the waitlist). */
  function submitDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found: { name?: string; phone?: string } = {}
    if (!name.trim()) found.name = NAME_ERROR
    if (!normalizePhone(`${PHONE_PREFIX}${phone}`)) {
      found.phone = phone.trim() ? PHONE_ERROR : 'Telefon nömrənizi daxil edin.'
    }
    setErrors(found)
    if (Object.keys(found).length > 0) {
      const formElement = event.currentTarget
      requestAnimationFrame(() => formElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setError(null)
    if (mode === 'waitlist') void signUpForWaitlist()
    else void confirm()
  }

  /** Full game: the details go straight to the waitlist. */
  async function signUpForWaitlist() {
    setPending(true)
    try {
      await postJson(`/api/v1/games/${game.id}/waitlist`, { name: name.trim(), phone: normalizePhone(`${PHONE_PREFIX}${phone}`) })
      setOpen(false)
      startRefresh(() => router.refresh())
    } catch (err) {
      if (err instanceof ApiError && err.code === 'UNAUTHENTICATED') {
        router.push(loginHref(joinUrl))
      } else {
        setError(err instanceof Error ? err.message : 'Gözləmə siyahısına yazılmaq mümkün olmadı.')
        // A spot may have opened (or the list changed) since the page was drawn.
        router.refresh()
      }
    } finally {
      setPending(false)
    }
  }

  async function leaveWaitlist() {
    setPending(true)
    setError(null)
    try {
      await apiFetch(`/api/v1/games/${game.id}/waitlist`, { method: 'DELETE' })
      setConfirmLeaveList(false)
      startRefresh(() => router.refresh())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Siyahıdan çıxmaq mümkün olmadı.')
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  async function confirm() {
    setPending(true)
    setError(null)
    try {
      const joinedGame = await postJson<{ savedToProfile?: boolean }>(`/api/v1/games/${game.id}/join`, {
        name: name.trim(),
        phone: normalizePhone(`${PHONE_PREFIX}${phone}`),
        side,
        ...(phoneNote === 'differs' && savePhone ? { saveToProfile: true } : {}),
      })
      setJustJoined(true)
      setLeftMessage('')
      setOpen(false)
      // Brings in the new player count and the host's phone, which only joined players see. When the
      // number was kept on the profile, expiring the cached session does that re-render too.
      startRefresh(() => (joinedGame.savedToProfile ? expireSession() : router.refresh()))
    } catch (err) {
      if (!(err instanceof ApiError)) {
        setError('Hazırda oyuna qoşulmaq mümkün olmadı.')
      } else if (err.code === 'UNAUTHENTICATED') {
        router.push(loginHref(joinUrl))
      } else if (err.code === 'INVALID_PHONE' || err.code === 'INVALID_NAME') {
        // Server-side validation disagreed: mark the field it belongs to.
        setErrors(err.code === 'INVALID_PHONE' ? { phone: err.message } : { name: err.message })
      } else {
        // e.g. 409 GAME_FULL: "Oyunda boş yer qalmayıb."
        setError(err.message)
        if (REFRESH_ON.has(err.code)) router.refresh()
      }
    } finally {
      setPending(false)
    }
  }

  const fieldError = (field: 'name' | 'phone') =>
    errors[field] ? (
      <p id={`${id}-${field}-error`} className={form.fieldError}>
        {errors[field]}
      </p>
    ) : null

  const live = game.status === 'live'
  const played = live || game.status === 'finished'

  return (
    <>
      {played ? (
        // Past the start nothing can be joined, left or changed any more; say what happened instead.
        <div className={styles.past}>
          <p className={styles.state}>
            {live && <span className={styles.activeDot} aria-hidden="true" />}
            {live ? 'Oyun davam edir' : `Oyun keçirilib · ${game.dateLabel}`}
          </p>
          {(game.viewer.isHost || joined) && (
            <p className={styles.pastNote}>
              {game.viewer.isHost
                ? live
                  ? 'Bu oyunun hostu sizsiniz.'
                  : 'Bu oyunu siz təşkil etdiniz.'
                : live
                  ? 'Siz bu oyundasınız. Oyun başladığı üçün artıq ondan çıxmaq mümkün deyil.'
                  : 'Siz bu oyunda iştirak etdiniz.'}
            </p>
          )}
        </div>
      ) : game.viewer.isHost ? (
        <p className={styles.state}>Bu oyunun hostu sizsiniz</p>
      ) : joined ? (
        <>
          <p ref={joinedNote} tabIndex={-1} className={`${styles.state} ${styles.joined}`} role={justJoined ? 'status' : undefined}>
            <span className={`${styles.check} ${justJoined ? styles.checkPop : ''}`} aria-hidden="true">
              ✓
            </span>
            Siz bu oyuna qoşulmusunuz
          </p>
          {/* Until kick-off a player can give the spot back; the refresh after it shows "Qoşul" again. */}
          {isUpcoming(game.status) && (
            <LeaveGame
              gameId={game.id}
              onLeft={() => {
                setJustJoined(false)
                setLeftMessage('Oyundan çıxdınız. Yeriniz digər oyunçulara açıldı.')
              }}
            />
          )}
        </>
      ) : game.status === 'full' ? (
        <>
          {/* A line, not a dead button: the waitlist below is the action. */}
          <p className={styles.pastNote}>Oyun doludur: bütün yerlər tutulub.</p>
          {game.waitlist.yourPosition !== null ? (
            <>
              <p className={styles.state} role="status">
                Gözləmə siyahısında {placeLabel(game.waitlist.yourPosition)}
              </p>
              <p className={styles.pastNote}>Yer boşalanda avtomatik sizə veriləcək və bildiriş görəcəksiniz.</p>
              <button
                type="button"
                className={buttonClass('outlinePrimary', 'lg', { block: true })}
                disabled={pending}
                aria-haspopup="dialog"
                onClick={() => {
                  setError(null)
                  setConfirmLeaveList(true)
                }}
              >
                Siyahıdan çıx
              </button>
              <ConfirmDialog
                open={confirmLeaveList}
                onClose={() => setConfirmLeaveList(false)}
                title="Siyahıdan çıxmaq istəyirsiniz?"
                text="Növbədəki yerinizi itirəcəksiniz. Yenidən yazılsanız, siyahının sonuna düşəcəksiniz."
                confirmLabel="Bəli, çıx"
                pendingLabel="Çıxılır…"
                onConfirm={leaveWaitlist}
                pending={pending}
                error={error}
              />
              {error && (
                <p className={form.alert} role="alert">
                  {error}
                </p>
              )}
            </>
          ) : (
            <>
              {/* Docked on phones like "Qoşul", so a full game still shows what can be done without a scroll. */}
              <div className={styles.dock} data-join-dock>
                <button type="button" className={buttonClass('outlinePrimary', 'lg', { block: true })} onClick={() => openModal('waitlist')} aria-haspopup="dialog">
                  Gözləmə siyahısına yaz
                </button>
              </div>
              {game.waitlist.count > 0 && <p className={styles.pastNote}>{game.waitlist.count} nəfər gözləyir</p>}
            </>
          )}
        </>
      ) : game.status !== 'open' ? (
        <button type="button" className={buttonClass('muted', 'lg', { block: true, className: styles.cta })} disabled>
          {STATUS_LABELS[game.status]}
        </button>
      ) : (
        // On phones this docks to the bottom of the screen, so joining never needs a scroll.
        <div className={styles.dock} data-join-dock>
          <button
            type="button"
            className={buttonClass('primary', 'lg', { block: true, className: styles.cta })}
            onClick={() => openModal('join')}
            aria-haspopup="dialog"
          >
            Qoşul - {game.remainingSpots} yer qalıb
            <Icon name="arrowRight" className={styles.ctaArrow} />
          </button>
        </div>
      )}

      <p className="visually-hidden" role="status">
        {leftMessage}
      </p>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={mode === 'waitlist' ? 'Gözləmə siyahısına yaz' : 'Oyuna qoşul'}
      >
        <form className={styles.body} onSubmit={submitDetails} noValidate>
          <hr className={styles.divider} />
          <p className={styles.note}>
            {mode === 'waitlist'
              ? 'Yer boşalanda ilk növbədəkinə avtomatik verilir. Host sizi tanıya bilməsi üçün ad və əlaqə nömrənizi qeyd edin.'
              : 'Host sizi tanıya bilməsi üçün ad və əlaqə nömrənizi qeyd edin. Qoşulduqdan sonra hostun nömrəsi oyun səhifəsində görünəcək: gələcəyinizi ona bildirin.'}
          </p>

          <div className={form.field}>
            <label htmlFor={`${id}-name`} className={form.labelSmall}>
              Ad Soyad
            </label>
            <input
              id={`${id}-name`}
              className={form.input}
              type="text"
              autoComplete="name"
              placeholder="Adınız və soyadınız"
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                if (errors.name) setErrors((current) => ({ ...current, name: undefined }))
              }}
              required
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${id}-name-error` : undefined}
              data-autofocus
            />
            {fieldError('name')}
          </div>

          <div className={form.field}>
            <label htmlFor={`${id}-phone`} className={form.labelSmall}>
              Telefon nömrəsi
            </label>
            <PhoneInput
              id={`${id}-phone`}
              value={phone}
              onChange={(value) => {
                setPhone(value)
                if (errors.phone) setErrors((current) => ({ ...current, phone: undefined }))
              }}
              required
              invalid={Boolean(errors.phone)}
              describedBy={[phoneNote === 'none' ? '' : `${id}-phone-note`, errors.phone ? `${id}-phone-error` : '']
                .filter(Boolean)
                .join(' ')}
            />
            <PhoneProfileNote
              id={`${id}-phone-note`}
              source={phoneNote}
              save={savePhone}
              onSaveChange={setSavePhone}
            />
            {fieldError('phone')}
          </div>

          {mode === 'join' && (
            <fieldset className={form.field}>
              <legend className={form.labelSmall} style={{ marginBottom: 8 }}>
                Komanda
              </legend>
              <div className={`${choices.choices} ${choices.levels}`}>
                {SIDE_OPTIONS.map((fixed) => {
                  // A side with a club is named after it.
                  const option = fixed.value === 'random' ? fixed : { ...fixed, label: game.teams[fixed.value]?.name ?? fixed.label }
                  const free = option.value === 'random' ? null : game.freeBySide[option.value]
                  return (
                    <label key={option.value} className={`${choices.choice} ${choices.levelChoice} ${styles.sideChoice}`}>
                      <input
                        type="radio"
                        name={`${id}-side`}
                        value={option.value}
                        checked={side === option.value}
                        disabled={free === 0}
                        onChange={() => setSide(option.value)}
                      />
                      {option.label}
                      {free !== null && <span className={styles.sideFree}>{free === 0 ? 'dolu' : `${free} yer`}</span>}
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )}

          {error && (
            <p className={form.alert} role="alert">
              {error}
            </p>
          )}

          <button type="submit" className={buttonClass('primary', 'xl', { block: true })} disabled={pending} aria-busy={pending}>
            {pending ? (mode === 'waitlist' ? 'Yazılır…' : 'Qoşulur…') : mode === 'waitlist' ? 'Siyahıya yaz' : 'Qoşul'}
          </button>
        </form>
      </Modal>
    </>
  )
}
