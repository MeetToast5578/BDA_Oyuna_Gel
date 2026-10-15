'use client'

import { useEffect, useId, useRef } from 'react'

import { Icon } from './Icon'
import styles from './Modal.module.css'

/**
 * Modal built on <dialog>: the browser handles focus trapping, Escape and inert background.
 * Closing (Escape, backdrop click, close button) calls `onClose`. Mark a child `data-autofocus` to focus it on open.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  focusKey,
  wide = false,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  /** Change it to re-run the `data-autofocus` focus, e.g. when a wizard swaps step. */
  focusKey?: string | number
  /** Room for two columns, e.g. a game's two sides. */
  wide?: boolean
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // showModal() focuses the first focusable element (the close button); prefer the marked field.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    // Also on a focusKey change, when the previously focused control has just unmounted.
    if (open && dialog.open) dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    if (!open && dialog.open) dialog.close()
  }, [open, focusKey])

  return (
    <dialog
      ref={ref}
      className={`${styles.dialog} ${wide ? styles.wide : ''}`}
      aria-labelledby={titleId}
      onClose={() => {
        if (open) onClose()
      }}
      onClick={(event) => {
        // A click on the dialog element itself is a click on the backdrop.
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {/* Stays mounted while closed (the browser hides a closed <dialog>), so it can animate out. */}
      <div className={styles.card}>
        <div className={styles.top}>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Bağla">
            <Icon name="close" />
          </button>
        </div>
        <div className={styles.heading}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        {children}
      </div>
    </dialog>
  )
}
