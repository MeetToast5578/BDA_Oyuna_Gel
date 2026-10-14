'use client'

import { useState } from 'react'

import { apiFetch, ApiError } from '@/lib/api-client'
import { buttonClass } from '@/components/ui/button'
import danger from '@/components/ui/danger.module.css'
import form from '@/components/ui/form.module.css'
import { Modal } from '@/components/ui/Modal'
import styles from './Profile.module.css'

/**
 * "Hesabı sil", the same danger zone and confirm dialog as "Oyunu sil". `DELETE /api/v1/me` takes
 * the upcoming games this account hosts with it (see docs/api.md), so the text says how many; the
 * ones already played stay in the other players' history.
 */
export function DeleteAccount({ hostedGames }: { hostedGames: number }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const consequence =
    hostedGames > 0
      ? `Hesabınız birdəfəlik silinir. Təşkil etdiyiniz ${hostedGames} qarşıdakı oyun da silinir və həmin oyunlara qoşulan oyunçular yerini itirir. Keçirilmiş oyunlar digər oyunçuların tarixçəsində qalır. Bu əməliyyat geri qaytarıla bilməz.`
      : 'Hesabınız və bütün qoşulmalarınız birdəfəlik silinir. Bu əməliyyat geri qaytarıla bilməz.'

  async function remove() {
    setDeleting(true)
    setError(null)
    try {
      await apiFetch('/api/v1/me', { method: 'DELETE' })
      // A full load, as after "Çıxış": the route cleared the session cookies, and this drops the
      // browser-cached session and every prefetched signed-in page along with the old one. The
      // button stays pending until the home page replaces this one.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- the full load is the point
      window.location.assign('/')
    } catch (err) {
      setDeleting(false)
      if (err instanceof ApiError && err.code === 'UNAUTHENTICATED') {
        // The session is already gone; there is nothing left here to delete from.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- as above
        window.location.assign('/')
        return
      }
      setError(err instanceof Error ? err.message : 'Hesabı silmək mümkün olmadı.')
    }
  }

  return (
    <>
      <section className={`${danger.dangerZone} ${styles.dangerFlush}`} aria-labelledby="delete-account">
        <h3 id="delete-account" className={danger.dangerTitle}>
          Hesabı sil
        </h3>
        <p className={danger.dangerText}>{consequence}</p>
        {error && !confirmOpen && (
          <p className={form.alert} role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className={buttonClass('danger', 'lg', { className: danger.dangerButton })}
          onClick={() => {
            setError(null)
            setConfirmOpen(true)
          }}
          aria-haspopup="dialog"
        >
          Hesabı sil
        </button>
      </section>

      <Modal
        open={confirmOpen}
        onClose={() => {
          if (!deleting) setConfirmOpen(false)
        }}
        title="Hesabı silmək istəyirsiniz?"
      >
        <div className={danger.confirm}>
          <p className={danger.dangerText}>{consequence}</p>
          {error && (
            <p className={form.alert} role="alert">
              {error}
            </p>
          )}
          <div className={danger.confirmActions}>
            {/* Focus starts on the way out, so Enter never deletes an account by accident. */}
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
              {deleting ? 'Silinir…' : 'Bəli, hesabı sil'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
