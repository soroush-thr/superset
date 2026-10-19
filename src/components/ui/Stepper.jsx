import React from 'react'

/**
 * A compact tap-to-change value: [−] value [+]. The middle can be any
 * node (plain text, or a <select> for picking directly), so it suits both
 * logging sets and tweaking a plan with one thumb.
 */
export default function Stepper({ label, children, onDec, onInc, decDisabled, incDisabled, className = '' }) {
  return (
    <div className={`sx-stepper ${className}`} role="group" aria-label={label}>
      <button type="button" aria-label={`Less ${label}`} disabled={decDisabled} onClick={onDec}>
        &minus;
      </button>
      <span className="sx-stepper-value sx-num">{children}</span>
      <button type="button" aria-label={`More ${label}`} disabled={incDisabled} onClick={onInc}>
        +
      </button>
    </div>
  )
}
