import React, { useEffect } from 'react'

/**
 * A slide-over drawer, not a page navigation. Used for exercise detail
 * (section 9.2) so browsing the Library never loses list scroll position.
 * Closes on Escape or backdrop click.
 */
export default function Drawer({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="sx-drawer-backdrop" onClick={onClose}>
      <div
        className="sx-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sx-drawer-header">
          <h3>{title}</h3>
          <button type="button" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="sx-drawer-body">{children}</div>
      </div>
    </div>
  )
}
