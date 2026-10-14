'use client'

import { useState } from 'react'

import { buttonClass } from '@/components/ui/button'
import styles from './GameDetail.module.css'

/**
 * "Paylaş": the phone's own share sheet where there is one, otherwise the link is copied. The
 * WhatsApp link sits beside it either way, since that is where pickup games fill up.
 */
export function ShareButton({ title, text, url }: { title: string; text: string; url: string }) {
  const [status, setStatus] = useState('')

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url })
      } catch {
        // Closing the share sheet rejects too; there is nothing to report.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setStatus('Link kopyalandı')
    } catch {
      setStatus('Linki kopyalamaq alınmadı')
    }
  }

  return (
    <div className={styles.share}>
      <button type="button" className={buttonClass('outlinePrimary', 'md')} onClick={share}>
        Paylaş
      </button>
      <a
        className={buttonClass('outlineDark', 'md')}
        href={`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        WhatsApp
      </a>
      <p className={styles.shareStatus} aria-live="polite">
        {status}
      </p>
    </div>
  )
}
