import React from 'react'

/**
 * A segmented control -- e.g. the Home/Gym/All equipment profile switch
 * (section 9.1) or the peak/fraction credit mode toggle (section 9.4).
 * `options` is [{ value, label }]; `value`/`onChange` are the selected value.
 */
export default function Segmented({ options, value, onChange }) {
  return (
    <div className="sx-segmented" role="radiogroup">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={opt.value === value}
          className={`sx-segmented-item${opt.value === value ? ' sx-active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
