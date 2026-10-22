'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { apiFetch } from '@/lib/api-client'
import { buttonClass } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

/** "Siyahıdan çıx" beside a game the person is waiting for; the list refreshes without it. */
export function LeaveWaitlist({ gameId, title }: { gameId: string; title: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startRefresh] = useTransition()

  async function leave() {
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/api/v1/games/${gameId}/waitlist`, { method: 'DELETE' })
      setOpen(false)
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
      <button
        type="button"
        className={buttonClass('outlineDark', 'sm')}
        aria-haspopup="dialog"
        aria-label={`${title} oyununun gözləmə siyahısından çıx`}
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
      >
        Siyahıdan çıx
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Siyahıdan çıxmaq istəyirsiniz?"
        text="Növbədəki yerinizi itirəcəksiniz. Yenidən yazılsanız, siyahının sonuna düşəcəksiniz."
        confirmLabel="Bəli, çıx"
        pendingLabel="Çıxılır…"
        onConfirm={leave}
        pending={busy}
        error={error}
      />
    </>
  )
}
