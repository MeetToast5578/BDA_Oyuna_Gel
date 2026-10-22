'use client'

import { useEffect, useId, useRef, useState } from 'react'

import styles from './Header.module.css'

/**
 * The header's menu on narrow screens, where the nav links and account actions don't fit. Built on
 * the native popover: the browser handles Escape, clicking outside and focus return. Choosing a link
 * or an action inside it closes it, since an in-app navigation doesn't reload the page.
 */
export function MobileMenu({ children, badge }: { children: React.ReactNode; badge?: React.ReactNode }) {
  const id = useId()
  const panel = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const element = panel.current
    if (!element) return
    const onToggle = (event: Event) => setOpen((event as ToggleEvent).newState === 'open')
    element.addEventListener('toggle', onToggle)
    return () => element.removeEventListener('toggle', onToggle)
  }, [])

  return (
    <>
      <button
        type="button"
        className={styles.menuButton}
        popoverTarget={id}
        aria-expanded={open}
        aria-controls={id}
      >
        <span className="visually-hidden">{open ? 'Menyunu bağla' : 'Menyunu aç'}</span>
        <span className={styles.menuIcon} data-open={open || undefined} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        {/* On phones the profile link with its count lives inside the menu, so the button carries it too. */}
        {badge}
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        className={styles.menuPanel}
        onClick={(event) => {
          if ((event.target as Element).closest('a, button')) panel.current?.hidePopover()
        }}
      >
        {children}
      </div>
    </>
  )
}
