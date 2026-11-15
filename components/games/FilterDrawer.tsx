'use client'

import { useId, useState } from 'react'

import { buttonClass } from '@/components/ui/button'
import styles from './GamesSection.module.css'

/**
 * On phones the date, level and venue filters fold behind a "Filtr" button, so the games start on
 * the first screen; it opens by itself when a filter is on. Wider screens always show them.
 */
export function FilterDrawer({ active, children }: { active: number; children: React.ReactNode }) {
  const id = useId()
  const [open, setOpen] = useState(active > 0)
  return (
    <div className={styles.filterDrawer} data-open={open || undefined}>
      <button
        type="button"
        className={buttonClass('outlineDark', 'md', { className: styles.filterToggle })}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
      >
        {active > 0 ? `Filtr (${active})` : 'Filtr'}
      </button>
      <div id={id} className={styles.filterBody}>
        {children}
      </div>
    </div>
  )
}
