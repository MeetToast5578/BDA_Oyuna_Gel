import Link from 'next/link'
import { Suspense } from 'react'

import { getCurrentUser, getNoticeCount } from '@/lib/session'
import { Avatar } from '@/components/games/bits'
import { buttonClass } from '@/components/ui/button'
import styles from './Header.module.css'
import { LogoutButton } from './LogoutButton'
import { MobileMenu } from './MobileMenu'
import { Icon } from '@/components/ui/Icon'
import { NavLink } from './NavLink'

const MENU_LINKS = [
  { href: '/games', label: 'Açıq oyunlar' },
  { href: '/venues', label: 'Meydançalar' },
  { href: '/teams', label: 'Komandalar' },
  { href: '/leaderboard', label: 'Reytinq' },
  { href: '/about', label: 'Haqqımızda' },
  { href: '/rules', label: 'Qaydalar' },
  { href: '/contact', label: 'Əlaqə' },
]

function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={className ?? styles.logo} aria-label="OyunaGəl — ana səhifə">
      <span className={styles.dot} aria-hidden="true" />
      OyunaGəl
    </Link>
  )
}

/**
 * The only part of the header that depends on the request. It streams in behind the Suspense
 * boundary below, so a session lookup never holds up the rest of the page.
 */
async function SessionActions() {
  const user = await getCurrentUser()
  // A broken count must not take the header down with it.
  const notices = user ? await getNoticeCount(user.id).catch(() => 0) : 0

  if (!user) {
    return (
      <Link href="/login" className={buttonClass('outlineDark', 'md')}>
        Daxil ol
      </Link>
    )
  }

  return (
    <>
      {/* New notices show on the bell; it opens /notifications, which marks them seen. */}
      <NavLink href="/notifications" className={styles.bell} ariaLabel={`Bildirişlər${notices > 0 ? `, ${notices} yeni` : ''}`}>
        <Icon name="bell" />
        {notices > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {notices}
          </span>
        )}
      </NavLink>
      {/* The name is hidden on narrower bars, so the label carries it; it starts with "Profilim". */}
      <NavLink href="/profile" className={styles.user} ariaLabel={`Profilim — ${user.fullName}`}>
        <Avatar
          person={{ name: user.fullName, initials: user.initials, avatarUrl: user.avatarUrl }}
          size={34}
          decorative
          className={styles.avatar}
        />
        <span className={styles.userName}>{user.firstName}</span>
      </NavLink>
      <LogoutButton className={buttonClass('outlineDark', 'md')} />
    </>
  )
}

/** The same count on the phone menu's button, where the profile link itself is out of sight. */
async function MenuNoticeBadge() {
  const user = await getCurrentUser()
  const notices = user ? await getNoticeCount(user.id).catch(() => 0) : 0
  if (notices === 0) return null
  return (
    <span className={styles.badge}>
      <span aria-hidden="true">{notices}</span>
      <span className="visually-hidden">, {notices} bildiriş</span>
    </span>
  )
}

/** "Bildirişlər" in the phone menu, signed in only, with the unread count; the bar's bell stays out of the menu. */
async function MenuNotificationsLink() {
  const user = await getCurrentUser()
  if (!user) return null
  const notices = await getNoticeCount(user.id).catch(() => 0)
  return (
    <li>
      <Link href="/notifications" className={styles.menuLink}>
        Bildirişlər
        {notices > 0 && (
          <span className={styles.menuCount}>
            {notices}
            <span className="visually-hidden"> yeni</span>
          </span>
        )}
      </Link>
    </li>
  )
}

/** Holds the slot's width while the session resolves, so the buttons beside it do not jump. */
function SessionActionsFallback() {
  return <span className={styles.sessionPlaceholder} aria-hidden="true" />
}

export function Header() {
  return (
    <header className={styles.header}>
      <nav className={styles.nav} aria-label="Əsas naviqasiya">
        <Logo />

        <ul className={styles.links}>
          {MENU_LINKS.slice(0, 4).map((link) => (
            <li key={link.href}>
              {/* NavLink reads the pathname, which only exists at request time; the plain link is
                  prerendered into the shell and the active-state version swaps in after hydration. */}
              <Suspense
                fallback={
                  <Link href={link.href} className={styles.link}>
                    {link.label}
                  </Link>
                }
              >
                <NavLink href={link.href} className={styles.link}>
                  {link.label}
                </NavLink>
              </Suspense>
            </li>
          ))}
        </ul>

        <div className={styles.actions}>
          <div className={styles.session}>
            <Suspense fallback={<SessionActionsFallback />}>
              <SessionActions />
            </Suspense>
          </div>
          <Link href="/games/new" className={buttonClass('primary', 'md', { className: styles.create })}>
            Oyun yarat
          </Link>
          <MobileMenu
            badge={
              <Suspense fallback={null}>
                <MenuNoticeBadge />
              </Suspense>
            }
          >
            <ul className={styles.menuLinks}>
              {MENU_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={styles.menuLink}>
                    {link.label}
                  </Link>
                </li>
              ))}
              <Suspense fallback={null}>
                <MenuNotificationsLink />
              </Suspense>
            </ul>
            <div className={styles.menuSession}>
              <Suspense fallback={<SessionActionsFallback />}>
                <SessionActions />
              </Suspense>
            </div>
          </MobileMenu>
        </div>
      </nav>
    </header>
  )
}
