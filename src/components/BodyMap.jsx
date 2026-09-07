import React from 'react'

// Placeholder. The real component takes { view, values, scaleMax,
// onRegionClick } and renders 30 hand-authored SVG regions with a 5-stop
// heat ramp -- section 7, Phase 5 (the highest-risk phase: no correctness
// oracle other than "does it read as a body").
export default function BodyMap({ view = 'front' }) {
  return (
    <div className="sx-bodymap-placeholder">
      <span className="sx-eyebrow">Body map ({view})</span>
      <div className="sx-bodymap-placeholder-box" aria-hidden="true" />
      <p style={{ color: 'var(--text-faint)', fontSize: 'var(--fs-2)' }}>Lands in Phase 5.</p>
    </div>
  )
}
