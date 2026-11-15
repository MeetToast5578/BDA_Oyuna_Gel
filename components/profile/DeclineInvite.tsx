'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { postJson } from '@/lib/api-client'
import { buttonClass } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

/** "Rədd et" on an invitation: the host sees it declined, and the list refreshes without it. */
export function DeclineInvite({ inviteId, title }: { inviteId: string; title: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startRefresh] = useTransition()

  async function decline() {
    setBusy(true)
    setError(null)
    try {
      await postJson(`/api/v1/invites/${inviteId}/decline`)
      setOpen(false)
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
      <button
        type="button"
        className={buttonClass('outlineDark', 'sm')}
        aria-haspopup="dialog"
        aria-label={`${title} dəvətini rədd et`}
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
      >
        Rədd et
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Dəvəti rədd etmək istəyirsiniz?"
        text="Bu oyuna bir daha dəvət ala bilməyəcəksiniz, amma özünüz qoşula bilərsiniz."
        confirmLabel="Bəli, rədd et"
        pendingLabel="Rədd edilir…"
        onConfirm={decline}
        pending={busy}
        error={error}
      />
    </>
  )
}
