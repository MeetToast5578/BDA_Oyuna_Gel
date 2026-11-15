'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, type FormEvent } from 'react'

import { apiFetch, patchJson, postJson } from '@/lib/api-client'
import { TEAM_NAME_MAX } from '@/lib/team-logic'
import { buttonClass, type ButtonVariant } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import form from '@/components/ui/form.module.css'
import styles from './Teams.module.css'

/** Runs `action`, then refreshes the page behind it; the error, if any, is shown under the control. */
function useTeamAction() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [, startRefresh] = useTransition()

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setBusy(true)
    setError(null)
    try {
      await action()
      after?.()
      startRefresh(() => router.refresh())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Əməliyyat alınmadı.')
    } finally {
      setBusy(false)
    }
  }
  return { run, error, busy, router }
}

const alert = (error: string | null) =>
  error && (
    <p className={form.alert} role="alert">
      {error}
    </p>
  )

/** A button that asks once more before doing something that can't be taken back by the same person. */
function ConfirmButton({
  label,
  question,
  confirmLabel,
  variant = 'outlinePrimary',
  busy,
  onConfirm,
}: {
  label: string
  question: string
  confirmLabel: string
  variant?: ButtonVariant
  busy: boolean
  onConfirm: () => void
}) {
  const [asking, setAsking] = useState(false)
  return (
    <>
      <button type="button" className={buttonClass(variant, 'sm')} aria-haspopup="dialog" onClick={() => setAsking(true)}>
        {label}
      </button>
      {/* The action's own error shows beside the button, so the dialog closes as soon as it starts. */}
      <ConfirmDialog
        open={asking}
        onClose={() => setAsking(false)}
        title={question}
        confirmLabel={confirmLabel}
        pendingLabel="Gözləyin…"
        onConfirm={() => {
          setAsking(false)
          onConfirm()
        }}
        pending={busy}
      />
    </>
  )
}

/** "Komandadan çıx". A captain who leaves hands the club to its longest-standing member. */
export function LeaveTeam({ teamId, captain }: { teamId: string; captain: boolean }) {
  const { run, error, busy } = useTeamAction()
  return (
    <div className={styles.invite}>
      <ConfirmButton
        label="Komandadan çıx"
        question={captain ? 'Kapitanlıq ən köhnə üzvə keçəcək. Çıxırsınız?' : 'Komandadan çıxırsınız?'}
        confirmLabel="Bəli, çıx"
        busy={busy}
        onConfirm={() => run(() => postJson(`/api/v1/teams/${teamId}/leave`))}
      />
      {alert(error)}
    </div>
  )
}

/** The captain's "Çıxar" beside a member. */
export function RemoveMember({ teamId, userId, name }: { teamId: string; userId: string; name: string }) {
  const { run, error, busy } = useTeamAction()
  return (
    <span className={styles.memberAction}>
      <ConfirmButton
        label="Çıxar"
        question={`${name} çıxarılsın?`}
        confirmLabel="Bəli"
        busy={busy}
        onConfirm={() => run(() => apiFetch(`/api/v1/teams/${teamId}/members/${userId}`, { method: 'DELETE' }))}
      />
      {alert(error)}
    </span>
  )
}

/** The captain's invite link: copy it, send it on WhatsApp, or retire it for a new one. */
export function InviteLink({ teamId, teamName, url }: { teamId: string; teamName: string; url: string | null }) {
  const { run, error, busy } = useTeamAction()
  const [status, setStatus] = useState('')

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setStatus('Link kopyalandı')
    } catch {
      setStatus('Linki kopyalamaq alınmadı')
    }
  }

  const regenerate = () => run(() => patchJson(`/api/v1/teams/${teamId}`, { regenerateInviteCode: true }), () => setStatus(''))

  return (
    <div className={styles.invite}>
      {url ? (
        <>
          <div className={styles.inviteField}>
            <input className={`${form.input} ${form.inputCompact}`} value={url} readOnly aria-label="Dəvət linki" onFocus={(event) => event.target.select()} />
            <button type="button" className={buttonClass('outlinePrimary', 'md')} onClick={copy}>
              Kopyala
            </button>
            <a
              className={buttonClass('outlineDark', 'md')}
              href={`https://wa.me/?text=${encodeURIComponent(`${teamName} komandasına qoşul:\n${url}`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
          </div>
          <p className={styles.status} aria-live="polite">
            {status}
          </p>
          <ConfirmButton
            label="Yeni link yarat"
            question="Köhnə link işləməyəcək."
            confirmLabel="Yeni link yarat"
            busy={busy}
            onConfirm={regenerate}
          />
        </>
      ) : (
        <button type="button" className={buttonClass('primary', 'md')} disabled={busy} onClick={regenerate}>
          Dəvət linki yarat
        </button>
      )}
      {alert(error)}
    </div>
  )
}

/** The captain's rename. */
export function RenameTeam({ teamId, name }: { teamId: string; name: string }) {
  const { run, error, busy } = useTeamAction()
  const [value, setValue] = useState(name)

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(() => patchJson(`/api/v1/teams/${teamId}`, { name: value }))
  }

  return (
    <form className={styles.invite} onSubmit={submit}>
      <div className={styles.inviteField}>
        <input
          className={`${form.input} ${form.inputCompact}`}
          value={value}
          maxLength={TEAM_NAME_MAX}
          aria-label="Komandanın adı"
          onChange={(event) => setValue(event.target.value)}
        />
        <button type="submit" className={buttonClass('outlinePrimary', 'md')} disabled={busy || value.trim() === name}>
          Adı dəyiş
        </button>
      </div>
      {alert(error)}
    </form>
  )
}

/** "Komandaya qoş" on an invite link's landing page. */
export function JoinTeam({ teamId, code }: { teamId: string; code: string }) {
  const { run, error, busy, router } = useTeamAction()
  return (
    <div className={styles.invite}>
      <button
        type="button"
        className={buttonClass('primary', 'lg', { block: true })}
        disabled={busy}
        onClick={() => run(() => postJson(`/api/v1/teams/${teamId}/join`, { code }), () => router.push(`/teams/${teamId}`))}
      >
        Komandaya qoş
      </button>
      {alert(error)}
    </div>
  )
}
