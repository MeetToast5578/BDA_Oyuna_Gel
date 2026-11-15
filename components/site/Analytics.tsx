'use client'

import Link from 'next/link'
import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { CONSENT_COOKIE, LOGIN_COOKIE, MEASUREMENT_ID, initialiseAnalytics, readCookie, saveConsent, trackAction, trackPage } from '@/lib/analytics'
import { buttonClass } from '@/components/ui/button'
import styles from './Analytics.module.css'

const subscribe = (callback: () => void) => {
  window.addEventListener('oyuna-consent', callback)
  return () => window.removeEventListener('oyuna-consent', callback)
}
const snapshot = () => readCookie(CONSENT_COOKIE) ?? null
const serverSnapshot = () => null

export function AnalyticsSettings() {
  if (!MEASUREMENT_ID) return null
  return <button type="button" className={styles.settings} onClick={() => window.dispatchEvent(new Event('oyuna-open-consent'))}>Analitika seçimləri</button>
}

export function Analytics() {
  const pathname = usePathname()
  const consent = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  const [open, setOpen] = useState(false)
  const lastPage = useRef<string | null>(null)

  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener('oyuna-open-consent', show)
    return () => window.removeEventListener('oyuna-open-consent', show)
  }, [])

  useEffect(() => {
    if (consent !== 'granted' || !MEASUREMENT_ID) {
      lastPage.current = null
      return
    }
    initialiseAnalytics(pathname)
    if (lastPage.current !== pathname) {
      trackPage(pathname)
      lastPage.current = pathname
    }
    if (readCookie(LOGIN_COOKIE) === '1') {
      document.cookie = `${LOGIN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
      trackAction('login')
    }
  }, [consent, pathname])

  if (!MEASUREMENT_ID) return null
  const choose = (value: 'granted' | 'denied') => { saveConsent(value); setOpen(false) }
  return (
    <>
      {consent === 'granted' && <Script src={`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`} strategy="afterInteractive" />}
      {(open || (consent !== 'granted' && consent !== 'denied')) && (
        <section className={styles.banner} aria-labelledby="analytics-title" aria-describedby="analytics-description">
          <h2 id="analytics-title">Analitika seçimləri</h2>
          <p id="analytics-description">Saytdan necə istifadə olunduğunu anlamaq üçün Google Analytics kukilərindən yalnız razılığınızla istifadə edirik. Seçiminizi istənilən vaxt dəyişə bilərsiniz. <Link href="/privacy">Məxfilik</Link></p>
          <div className={styles.actions}>
            <button type="button" className={buttonClass('outlineDark', 'sm')} onClick={() => choose('denied')}>İmtina et</button>
            <button type="button" className={buttonClass('primary', 'sm')} onClick={() => choose('granted')}>Qəbul et</button>
          </div>
        </section>
      )}
    </>
  )
}
