'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { postJson } from '@/lib/api-client'
import { buttonClass } from '@/components/ui/button'
import form from '@/components/ui/form.module.css'

/** "Rədd et" on an invitation: the host sees it declined, and the list refreshes without it. */
export function DeclineInvite({ inviteId, title }: { inviteId: string; title: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startRefresh] = useTransition()

  async function decline() {
    setBusy(true)
    setError(null)
    try {
      await postJson(`/api/v1/invites/${inviteId}/decline`)
      startRefresh(() => router.refresh())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dəvəti rədd etmək mümkün olmadı.')
      // Already answered elsewhere (another tab, or by joining): the list is out of date.
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className={buttonClass('outlineDark', 'sm')} disabled={busy} aria-busy={busy} aria-label={`${title} dəvətini rədd et`} onClick={decline}>
        Rədd et
      </button>
      {error && (
        <span className={form.alert} role="alert">
          {error}
        </span>
      )}
    </>
  )
}
