import React, { useEffect, useState } from 'react'

/**
 * A destructive button that asks on the page instead of with
 * window.confirm (which some embedded browsers and installed web apps
 * block, answering "cancel" without showing anything). The first tap arms
 * it and swaps the label to `confirmLabel`; a second tap within a few
 * seconds runs `onConfirm`. Skips the question entirely when `skip` is set.
 */
export default function ConfirmButton({
  children,
  confirmLabel = 'Tap again to confirm',
  onConfirm,
  skip = false,
  className = '',
  ...rest
}) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return undefined
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])

  return (
    <button
      type="button"
      className={`${className}${armed ? ' sx-armed' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        if (skip || armed) {
          setArmed(false)
          onConfirm()
        } else {
          setArmed(true)
        }
      }}
      onBlur={() => setArmed(false)}
      {...rest}
    >
      {armed ? confirmLabel : children}
    </button>
  )
}
