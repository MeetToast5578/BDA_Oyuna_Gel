'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { apiFetch } from '@/lib/api-client'
import { buttonClass } from '@/components/ui/button'
import form from '@/components/ui/form.module.css'

/** "Siyahıdan çıx" beside a game the person is waiting for; the list refreshes without it. */
export function LeaveWaitlist({ gameId, title }: { gameId: string; title: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startRefresh] = useTransition()

  async function leave() {
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/api/v1/games/${gameId}/waitlist`, { method: 'DELETE' })
      startRefresh(() => router.refresh())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Siyahıdan çıxmaq mümkün olmadı.')
      // Already off the list (a spot reached them, or another tab): the page is out of date.
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className={buttonClass('outlineDark', 'sm')} disabled={busy} aria-busy={busy} aria-label={`${title} oyununun gözləmə siyahısından çıx`} onClick={leave}>
        Siyahıdan çıx
      </button>
      {error && (
        <span className={form.alert} role="alert">
          {error}
        </span>
      )}
    </>
  )
}
