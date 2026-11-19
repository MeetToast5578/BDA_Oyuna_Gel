import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { AuthShell, GoogleButton, GoogleButtonSkeleton, GoogleUnavailable } from '@/components/auth/AuthShell'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { getCurrentUser, isGoogleAuthConfigured } from '@/lib/session'

export const metadata: Metadata = { title: 'Daxil ol' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** Google is the only way in: there is no email/password form and no separate sign-up. */
export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <AuthShell
      eyebrow="Xoş gəlmisiniz"
      title="Hesabınıza daxil olun"
      description="Ad, soyad və nömrə istənilmir — Google hesabınızla bir kliklə davam edin."
    >
      <Suspense fallback={<GoogleButtonSkeleton />}>
        <SignInAction searchParams={searchParams} />
      </Suspense>
      {/* Separate, so the button never waits on the session lookup (and the database) behind it. */}
      <Suspense fallback={null}>
        <RedirectIfSignedIn searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  )
}

/** Set by the Google callback when sign-in did not finish (app/api/auth/google/callback). */
const ERRORS: Record<string, string> = {
  google: 'Google ilə giriş alınmadı. Zəhmət olmasa yenidən cəhd edin.',
  taken: 'Bu e-poçt başqa Google hesabına bağlıdır. Əvvəl istifadə etdiyiniz Google hesabı ilə daxil olun.',
}

async function SignInAction({ searchParams }: { searchParams: SearchParams }) {
  const { next: rawNext, error } = await searchParams
  const next = safeRedirectPath(rawNext)
  if (!isGoogleAuthConfigured()) {
    return (
      <GoogleUnavailable>
        Google ilə giriş hazırda əlçatan deyil. Zəhmət olmasa bir az sonra yenidən cəhd edin.
      </GoogleUnavailable>
    )
  }
  return (
    <>
      {typeof error === 'string' && Object.hasOwn(ERRORS, error) && <GoogleUnavailable>{ERRORS[error]}</GoogleUnavailable>}
      <GoogleButton href={`/api/auth/google?next=${encodeURIComponent(next)}`} />
    </>
  )
}

/** Someone already signed in has nothing to do here: send them where they were going. */
async function RedirectIfSignedIn({ searchParams }: { searchParams: SearchParams }) {
  const next = safeRedirectPath((await searchParams).next)
  if (await getCurrentUser()) redirect(next)
  return null
}
