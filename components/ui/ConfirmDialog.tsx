'use client'

import { buttonClass } from '@/components/ui/button'
import danger from '@/components/ui/danger.module.css'
import form from '@/components/ui/form.module.css'
import { Modal } from '@/components/ui/Modal'

/**
 * The one way the site asks before something that can't be undone (leaving a list, declining, removing
 * someone): a dialog that says what happens, with focus on "İmtina et" so Enter never does it by
 * accident. The caller owns `open`, runs the action in `onConfirm` and passes back `pending`/`error`.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  text,
  confirmLabel,
  pendingLabel,
  onConfirm,
  pending,
  error,
  tone = 'danger',
}: {
  open: boolean
  onClose: () => void
  title: string
  /** What happens; the title alone is enough for a plain yes/no. */
  text?: string
  confirmLabel: string
  pendingLabel: string
  onConfirm: () => void
  pending: boolean
  error?: string | null
  tone?: 'danger' | 'primary'
}) {
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!pending) onClose()
      }}
      title={title}
    >
      <div className={danger.confirm}>
        {text && <p className={danger.dangerText}>{text}</p>}
        {error && (
          <p className={form.alert} role="alert">
            {error}
          </p>
        )}
        <div className={danger.confirmActions}>
          <button type="button" className={buttonClass('muted', 'lg')} onClick={onClose} disabled={pending} data-autofocus>
            İmtina et
          </button>
          <button type="button" className={buttonClass(tone, 'lg')} onClick={onConfirm} disabled={pending} aria-busy={pending}>
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
