'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useOptimistic, useTransition } from 'react'

import { withQuery } from '@/lib/api-client'
import type { SportTab } from '@/lib/api-types'
import { sortSports, SPORT_EMOJI } from './sports'
import styles from './SportTabs.module.css'

/**
 * "Nə oynamaq istəyirsən?" filter. Each tab is a link that sets `?sport=`, so the filtered grid is
 * server-rendered and shareable; choosing the active tab again clears the filter.
 *
 * The chosen tab lights up on the click itself rather than when the new list arrives, and
 * `data-pending` lets the section dim the old list meanwhile, so a slow response never looks like
 * a click that did nothing.
 */
export function SportTabs({
  sports,
  active,
  basePath,
  query,
  countLabel = 'açıq oyun',
}: {
  sports: SportTab[]
  active: string | null
  basePath: string
  /** The page's other filters (`/games`' date, level, venue), kept when the sport changes. */
  query?: Record<string, string | null>
  /** What each tab's count is of: "açıq oyun" above the open games, "keçmiş oyun" above past ones. */
  countLabel?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [shownActive, setShownActive] = useOptimistic(active)

  function select(event: React.MouseEvent<HTMLAnchorElement>, sport: string | null, href: string) {
    // Let the browser handle "open in new tab" and friends.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    startTransition(() => {
      setShownActive(sport)
      router.replace(href, { scroll: false })
    })
  }

  return (
    <nav aria-label="İdman növü filtri" data-pending={pending || undefined}>
      <ul className={styles.tabs}>
        {sortSports(sports).map((sport) => {
          const isActive = sport.sport === shownActive
          // Tapping the active tab clears the filter.
          const target = sport.sport === active ? null : sport.sport
          const href = withQuery(basePath, { sport: target, ...query })
          return (
            <li key={sport.sport}>
              <Link
                href={href}
                scroll={false}
                replace
                className={`${styles.tab} ${isActive ? styles.active : ''}`}
                aria-current={isActive ? 'true' : undefined}
                onClick={(event) => select(event, target, href)}
              >
                <span className={styles.emoji} aria-hidden="true">
                  {SPORT_EMOJI[sport.iconKey] ?? '🏅'}
                </span>
                <span className={styles.label}>{sport.label}</span>
                <span className={styles.count}>
                  {sport.count} {countLabel}
                </span>
                {pending && isActive && <span className={styles.spinner} aria-hidden="true" />}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
