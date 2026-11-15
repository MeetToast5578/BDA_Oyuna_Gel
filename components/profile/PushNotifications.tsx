'use client'

import { useEffect, useState } from 'react'

import detail from '@/components/games/GameDetail.module.css'
import form from '@/components/ui/form.module.css'
import { apiFetch, postJson } from '@/lib/api-client'
import styles from './Profile.module.css'

type State = 'loading' | 'unsupported' | 'denied' | 'off' | 'on'

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

/** The VAPID public key as the Push API wants it. */
function keyBytes(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
}

/** Whether this browser can do it at all; iPhones only can once the site is on the home screen. */
async function currentState(): Promise<State> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
  return (await registration.pushManager.getSubscription()) ? 'on' : 'off'
}

/**
 * "Telefona bildiriş göndər": the same notices as /notifications, on this device. Per device, since a
 * subscription belongs to the browser; hidden until the site has VAPID keys (lib/push.ts).
 */
export function PushNotifications() {
  const [state, setState] = useState<State>('loading')
  const [status, setStatus] = useState('')

  useEffect(() => {
    currentState().then(setState, () => setState('unsupported'))
  }, [])

  async function toggle(next: boolean) {
    setStatus('')
    try {
      const registration = await navigator.serviceWorker.ready
      if (next) {
        const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY ?? '') })
        await postJson('/api/v1/me/push', subscription.toJSON())
        setState('on')
        setStatus('Bu cihaza bildirişlər açıldı')
      } else {
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) {
          await apiFetch('/api/v1/me/push', { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) })
          await subscription.unsubscribe()
        }
        setState('off')
        setStatus('Bu cihaza bildirişlər söndürüldü')
      }
    } catch {
      setState(Notification.permission === 'denied' ? 'denied' : next ? 'off' : 'on')
      setStatus(Notification.permission === 'denied' ? '' : 'Alınmadı, yenidən yoxlayın')
    }
  }

  if (!KEY) return null
  return (
    <div className={`${detail.panel} ${styles.accountPanel}`}>
      <label className={form.check}>
        <input
          type="checkbox"
          checked={state === 'on'}
          disabled={state === 'loading' || state === 'unsupported' || state === 'denied'}
          onChange={(event) => toggle(event.target.checked)}
        />
        <span>Bu cihaza bildiriş göndər: dəvət, gözləmə siyahısı, dəyişən oyun və oyundan 2 saat əvvəl xatırlatma</span>
      </label>
      <p className={styles.accountText} aria-live="polite">
        {state === 'unsupported'
          ? 'Bu brauzer bildirişləri dəstəkləmir. iPhone-da saytı "Əsas ekrana əlavə et" ilə quraşdırıb oradan açın.'
          : state === 'denied'
            ? 'Bildirişlər brauzerdə bloklanıb. Saytın parametrlərindən icazə verin.'
            : status}
      </p>
    </div>
  )
}
