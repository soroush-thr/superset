import React, { useState } from 'react'
import Drawer from './ui/Drawer.jsx'
import BodyMap from './BodyMap.jsx'
import { IMG_BASE } from '../lib/constants.js'
import { subgroupName } from '../lib/taxonomy.js'
import { peakNormalize } from '../lib/coverage.js'

function label(value) {
  if (value === null || value === undefined) return 'Unspecified'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function ExerciseImage({ src }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return <div className="sx-detail-image-placeholder" aria-hidden="true" />
  }
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
}

/**
 * Section 9.2: images, instructions, equipment/level/mechanic/force, the
 * sub-group weight list, a mini body map (section 6.6: peak-normalized so
 * the strongest region renders at full heat), and an honest conf/reviewed
 * flag. The ?review=1 weight-editor affordance (section 3.2) is a
 * nice-to-have and is not included here.
 */
export default function ExerciseDetail({ exercise, open, onClose }) {
  if (!exercise) {
    return <Drawer open={open} onClose={onClose} title="Exercise" />
  }

  const sortedSub = Object.entries(exercise.sub || {}).sort((a, b) => b[1] - a[1])
  const previewValues = peakNormalize(exercise.sub)

  return (
    <Drawer open={open} onClose={onClose} title={exercise.name}>
      <div className="sx-detail-images">
        <ExerciseImage src={exercise.images[0] && `${IMG_BASE}${exercise.images[0]}`} />
        <ExerciseImage src={exercise.images[1] && `${IMG_BASE}${exercise.images[1]}`} />
      </div>

      <div className="sx-detail-meta">
        <MetaItem label="Equipment" value={label(exercise.equipment)} />
        <MetaItem label="Level" value={label(exercise.level)} />
        <MetaItem label="Mechanic" value={label(exercise.mechanic)} />
        <MetaItem label="Force" value={label(exercise.force)} />
      </div>

      <span className="sx-eyebrow">
        {exercise.reviewed ? 'Reviewed' : 'Auto-mapped'}
        {exercise.conf === 'low' ? ' - low confidence' : ''}
      </span>

      <h3>What this hits</h3>
      <BodyMap view="front" values={previewValues} scaleMax={1} />
      <ul className="sx-weight-list">
        {sortedSub.map(([subgroupId, weight]) => (
          <li key={subgroupId}>
            <span>{subgroupName(subgroupId)}</span>
            <span className="sx-num">{weight.toFixed(2)}</span>
          </li>
        ))}
      </ul>

      {exercise.steps.length > 0 && (
        <>
          <h3>Instructions</h3>
          <ol className="sx-steps-list">
            {exercise.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </>
      )}
    </Drawer>
  )
}

function MetaItem({ label, value }) {
  return (
    <div className="sx-meta-item">
      <span className="sx-eyebrow">{label}</span>
      <span>{value}</span>
    </div>
  )
}
