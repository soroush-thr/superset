import React from 'react'

/**
 * A numeric input with +/- steppers, usable on touch (section 9.3: "all
 * numeric inputs are mono, tabular, with steppers usable on touch"). Used
 * for sets, rep ranges, rest seconds, RPE, and target ranges.
 */
export default function NumberField({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  label,
}) {
  const clamp = (v) => Math.min(max, Math.max(min, v))

  return (
    <div className="sx-number-field">
      {label && <span className="sx-eyebrow">{label}</span>}
      <div className="sx-number-field-controls">
        <button
          type="button"
          aria-label="Decrease"
          onClick={() => onChange(clamp((value ?? 0) - step))}
        >
          &minus;
        </button>
        <input
          className="sx-num"
          type="number"
          value={value ?? ''}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (!Number.isNaN(n)) onChange(clamp(n))
          }}
        />
        <button
          type="button"
          aria-label="Increase"
          onClick={() => onChange(clamp((value ?? 0) + step))}
        >
          +
        </button>
      </div>
    </div>
  )
}
