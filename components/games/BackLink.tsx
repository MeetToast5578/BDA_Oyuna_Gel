'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'


type NavigationApi = { currentEntry?: { index: number } | null }

/**
 * "← Geri qayıt": steps back when the previous history entry is a page of this site, else links to
 * `fallback`. The Navigation API only lists same-origin entries, so index > 0 means "came from here".
 * Styled as a quiet text link (`.back-link`); `className` adds page-specific rules on top.
 */
export function BackLink({ fallback, className, children }: { fallback: string; className?: string; children: React.ReactNode }) {
  const router = useRouter()

  return (
    <Link
      href={fallback}
      className={['back-link', className].filter(Boolean).join(' ')}
      onClick={(event) => {
        const navigation = (window as { navigation?: NavigationApi }).navigation
        if ((navigation?.currentEntry?.index ?? 0) > 0) {
          event.preventDefault()
          router.back()
        }
      }}
    >
      <span aria-hidden="true">←</span> {children}
    </Link>
  )
}
