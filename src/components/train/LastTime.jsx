import React from 'react'
import { formatWeight } from '../../lib/units.js'

/** Read-only reference: what you did last time you logged this exercise.
 *  This is the single highest-value piece of the logging feature -- it's
 *  the whole reason people carry a notebook to the gym. */
export default function LastTime({ last, unit }) {
  if (!last) return null
  const { session, sets } = last
  const date = new Date(session.endedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  return (
    <div className="sx-last-time">
      <span className="sx-eyebrow">Last time ({date})</span>
      <span className="sx-num">
        {sets.map((s) => `${formatWeight(s.weightKg, unit)}×${s.reps ?? '-'}`).join(', ')}
      </span>
    </div>
  )
}
