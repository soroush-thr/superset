import React from 'react'
import Drawer from './ui/Drawer.jsx'

// Placeholder. Full implementation (images, steps, sub-group weights, mini
// body map, conf/reviewed flag, ?review=1 affordance) is section 9.2, Phase 6.
export default function ExerciseDetail({ exercise, open, onClose }) {
  return (
    <Drawer open={open} onClose={onClose} title={exercise?.name ?? 'Exercise'}>
      <p style={{ color: 'var(--text-dim)' }}>Exercise detail lands in Phase 6.</p>
    </Drawer>
  )
}
