'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { ApiError, postJson } from '@/lib/api-client'
import { loginHref } from '@/lib/safe-redirect'
import { buttonClass } from '@/components/ui/button'
import danger from '@/components/ui/danger.module.css'
import form from '@/components/ui/form.module.css'
import { Modal } from '@/components/ui/Modal'

/**
 * "Komandanı oyundan çıxar", for the captain of the club the host put against their own side.
 * Confirms, then `POST /api/v1/games/{id}/decline-club` opens that side to anyone.
 */
export function DeclineClub({ gameId, clubName }: { gameId: string; clubName: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startRefresh] = useTransition()

  async function decline() {
    setPending(true)
    setError(null)
    try {
      await postJson(`/api/v1/games/${gameId}/decline-club`)
      setOpen(false)
      startRefresh(() => router.refresh())
    } catch (err) {
      if (err instanceof ApiError && err.code === 'UNAUTHENTICATED') {
        router.push(loginHref(pathname))
        return
      }
      setError(err instanceof Error ? err.message : 'Oyundan çəkilmək mümkün olmadı.')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={buttonClass('outlinePrimary', 'lg', { block: true })}
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
        aria-haspopup="dialog"
      >
        {clubName} komandasını oyundan çıxar
      </button>

      <Modal
        open={open}
        onClose={() => {
          if (!pending) setOpen(false)
        }}
        title="Komanda oyundan çıxarılsın?"
      >
        <div className={danger.confirm}>
          <p className={danger.dangerText}>
            <strong>{clubName}</strong> bu oyunda rəqib komanda kimi göstərilib. Çıxarsanız, həmin tərəf hər kəsə açıq olacaq.
            Artıq qoşulmuş oyunçular qalır.
          </p>
          {error && (
            <p className={form.alert} role="alert">
              {error}
            </p>
          )}
          <div className={danger.confirmActions}>
            <button type="button" className={buttonClass('muted', 'lg')} onClick={() => setOpen(false)} disabled={pending} data-autofocus>
              İmtina et
            </button>
            <button type="button" className={buttonClass('danger', 'lg')} onClick={decline} disabled={pending} aria-busy={pending}>
              {pending ? 'Çıxarılır…' : 'Bəli, çıxar'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
