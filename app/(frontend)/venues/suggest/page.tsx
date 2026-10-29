import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'

import styles from '@/components/create/GameForm.module.css'
import { BackLink } from '@/components/games/BackLink'
import { buttonClass } from '@/components/ui/button'
import { SuggestVenueForm } from '@/components/venues/SuggestVenueForm'
import { loginHref } from '@/lib/safe-redirect'
import { getCurrentUser } from '@/lib/session'

export const metadata: Metadata = { title: 'Meydança təklif et' }

/** A form for a venue the site is missing; the heading is static, the form waits for the session. */
export default function SuggestVenuePage() {
  return (
    <div className={`container-wide ${styles.page}`}>
      <BackLink fallback="/venues" className={styles.back}>
        Geri qayıt
      </BackLink>
      <div className={styles.intro}>
        <h1 className={styles.title}>Meydança təklif et</h1>
        <p className={styles.subtitle}>Oynadığınız meydança siyahıda yoxdur? Yazın, yoxlayıb əlavə edək.</p>
      </div>
      <Suspense fallback={<p className={styles.subtitle}>Yüklənir…</p>}>
        <SignedInForm />
      </Suspense>
    </div>
  )
}

async function SignedInForm() {
  // proxy.ts sends visitors without a session cookie to /login; an expired one lands here.
  if (!(await getCurrentUser())) {
    return (
      <Link href={loginHref('/venues/suggest')} className={buttonClass('primary', 'lg')}>
        Daxil ol
      </Link>
    )
  }
  return <SuggestVenueForm />
}
