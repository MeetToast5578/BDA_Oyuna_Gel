'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useOptimistic, useTransition } from 'react'

import { profileTabsQuery, type ProfileRole, type ProfileWindow } from '@/lib/game-backend'
import segmented from '@/components/ui/segmented.module.css'
import styles from './Profile.module.css'

type Tab = { role: ProfileRole; when: ProfileWindow }

const ROLES: Array<{ value: ProfileRole; label: string }> = [
  { value: 'joined', label: 'Qoşulduğum' },
  { value: 'hosting', label: 'Təşkil etdiyim' },
]

const WINDOWS: Array<{ value: ProfileWindow; label: string }> = [
  { value: 'upcoming', label: 'Qarşıdakı' },
  { value: 'past', label: 'Keçmiş' },
]

/**
 * "Qoşulduğum / Təşkil etdiyim" × "Qarşıdakı / Keçmiş", two switches on one line, the first with each
 * role's upcoming count. Links that set `?games=` and `?when=`, so
 * the list is server-rendered and a reload keeps the tab — the pattern of the sport tabs: the choice
 * lights up on the click itself and `data-pending` dims the old list until the new one arrives.
 */
export function ProfileTabs({
  role,
  when,
  upcomingCounts,
}: Tab & {
  /** Upcoming games per role, for the count line under each tab. */
  upcomingCounts: Record<ProfileRole, number>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [shown, setShown] = useOptimistic<Tab>({ role, when })

  function select(event: React.MouseEvent<HTMLAnchorElement>, next: Tab, href: string) {
    // Let the browser handle "open in new tab" and friends.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    if (next.role === shown.role && next.when === shown.when) return
    startTransition(() => {
      setShown(next)
      router.replace(href, { scroll: false })
    })
  }

  const link = (next: Tab, active: boolean, className: string, children: React.ReactNode) => {
    const href = `/profile${profileTabsQuery(next)}`
    return (
      <Link
        href={href}
        scroll={false}
        replace
        className={className}
        aria-current={active ? 'true' : undefined}
        onClick={(event) => select(event, next, href)}
      >
        {children}
      </Link>
    )
  }

  return (
    <nav className={styles.tabs} aria-label="Oyunları süz" data-pending={pending || undefined}>
      <ul className={`${segmented.segments} ${styles.roleSwitch}`}>
        {ROLES.map((option) => {
          const active = shown.role === option.value
          return (
            <li key={option.value}>
              {link(
                { role: option.value, when: shown.when },
                active,
                `${segmented.segment} ${active ? segmented.segmentActive : ''}`,
                <>
                  {option.label}
                  <span className={styles.roleCount}>
                    {upcomingCounts[option.value]}
                    <span className="visually-hidden"> qarşıdakı oyun</span>
                  </span>
                </>,
              )}
            </li>
          )
        })}
      </ul>
      <ul className={segmented.segments}>
        {WINDOWS.map((option) => {
          const active = shown.when === option.value
          return (
            <li key={option.value}>
              {link(
                { role: shown.role, when: option.value },
                active,
                `${segmented.segment} ${active ? segmented.segmentActive : ''}`,
                option.label,
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
