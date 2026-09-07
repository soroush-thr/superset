import React from 'react'
import { useStore } from '../App.jsx'

// Placeholder. Full implementation (routine CRUD, day/slot editing, the
// "Make superset" merge/split, live volume readout) is section 9.3, Phase 7.
export default function RoutineBuilder() {
  const { state } = useStore()
  return (
    <div>
      <span className="sx-eyebrow">Routine builder</span>
      <h2>{state.routines.length === 0 ? 'No routines yet' : state.activeRoutineId}</h2>
      <p style={{ color: 'var(--text-dim)' }}>
        Day cards, slot/entry editing, and supersets land in Phase 7.
      </p>
    </div>
  )
}
