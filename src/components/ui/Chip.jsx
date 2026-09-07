import React from 'react'

/**
 * A single filter/selection chip. Used for equipment, level, mechanic, force
 * filters in the Library (section 9.1) and elsewhere. Neutral colours only --
 * chroma is reserved for data (section 8.1).
 */
export default function Chip({ label, active = false, onClick, disabled = false }) {
  return (
    <button
      type="button"
      className={`sx-chip${active ? ' sx-active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
    >
      {label}
    </button>
  )
}
