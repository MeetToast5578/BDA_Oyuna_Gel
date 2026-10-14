'use client'

import { useState } from 'react'

import detail from '@/components/games/GameDetail.module.css'
import form from '@/components/ui/form.module.css'
import { patchJson } from '@/lib/api-client'
import styles from './Profile.module.css'

/**
 * "E-poçt bildirişləri": emails about the games this user joined (a join confirmation with a calendar
 * file, a changed time or place, a cancellation). Saved as soon as it is ticked; a failed save puts
 * the box back and says so.
 */
export function EmailNotifications({ email, enabled }: { email: string; enabled: boolean }) {
  const [on, setOn] = useState(enabled)
  const [status, setStatus] = useState('')

  async function toggle(next: boolean) {
    setOn(next)
    setStatus('')
    try {
      await patchJson('/api/v1/me', { emailNotifications: next })
      setStatus(next ? 'Bildirişlər açıldı' : 'Bildirişlər söndürüldü')
    } catch {
      setOn(!next)
      setStatus('Yadda saxlamaq alınmadı, yenidən yoxlayın')
    }
  }

  return (
    <div className={`${detail.panel} ${styles.accountPanel}`}>
      <label className={form.check}>
        <input type="checkbox" checked={on} onChange={(event) => toggle(event.target.checked)} />
        <span>
          Qoşulduğum oyunlar haqqında <strong>{email}</strong> ünvanına e-poçt göndər
        </span>
      </label>
      <p className={styles.accountText} aria-live="polite">
        {status}
      </p>
    </div>
  )
}
