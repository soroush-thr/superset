import React from 'react'
import { OWNABLE_SIZES, ownedFor, sameWeight, toggleOwned } from '../../lib/weights.js'
import { fromDisplay } from '../../lib/units.js'

const NAMES = { dumbbell: 'Dumbbells', kettlebells: 'Kettlebells' }

/**
 * Pick which fixed weights you own for one piece of equipment. While
 * logging, that exercise's weight picker then offers only these sizes;
 * picking none means any weight.
 */
export default function OwnedWeights({ equipment, ownedWeights, unit, onChange }) {
  const sizes = OWNABLE_SIZES[equipment]?.[unit === 'lb' ? 'lb' : 'kg'] ?? []
  const owned = ownedFor(ownedWeights, equipment)
  const has = (v) => owned.some((kg) => sameWeight(kg, fromDisplay(v, unit)))
  const count = sizes.filter(has).length

  return (
    <details className="sx-owned-weights">
      <summary>
        {NAMES[equipment] ?? equipment} you have: {owned.length ? `${owned.length} selected` : 'any weight'}
      </summary>
      <div className="sx-chip-row">
        {sizes.map((v) => (
          <button
            key={v}
            type="button"
            className={`sx-chip sx-chip-weight sx-num${has(v) ? ' sx-active' : ''}`}
            aria-pressed={has(v)}
            onClick={() => onChange(toggleOwned(ownedWeights, equipment, v, unit))}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="sx-owned-actions">
        <span className="sx-helper-text">
          {unit} {equipment === 'dumbbell' ? 'per dumbbell' : 'per bell'}
          {count ? '' : ' · none picked = every weight is offered'}
        </span>
        {owned.length > 0 && (
          <button type="button" className="sx-link-button" onClick={() => onChange({ ...ownedWeights, [equipment]: [] })}>
            Clear
          </button>
        )}
      </div>
    </details>
  )
}
