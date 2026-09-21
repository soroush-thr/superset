import React, { useMemo, useState } from 'react'
import Drawer from './ui/Drawer.jsx'
import BodyMap from './BodyMap.jsx'
import { IMG_BASE } from '../lib/constants.js'
import { subgroupName } from '../lib/taxonomy.js'
import { peakNormalize, substitutesFor } from '../lib/coverage.js'
import { equipmentOptionsFor, allEquipment } from '../lib/equipment.js'
import { useStore, useDispatch, useExercises } from '../App.jsx'

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
 * sub-group weight list, a mini body map, substitute suggestions (cosine
 * similarity over `sub`, same equipment/level gate as Coverage's gap
 * suggestions), and -- for a user-created exercise -- a delete action.
 * `onSelectExercise` lets a substitute row swap the drawer's content
 * in place instead of closing it.
 */
export default function ExerciseDetail({ exercise, open, onClose, onSelectExercise }) {
  const { state } = useStore()
  const dispatch = useDispatch()
  const exercisesIndex = useExercises()

  const substitutes = useMemo(() => {
    if (!exercise) return []
    const equipmentProfile = equipmentOptionsFor(
      state.settings.equipmentProfiles,
      state.settings.activeProfile,
      allEquipment(state.customExercises),
    )
    return substitutesFor(exercise.id, {
      index: exercisesIndex,
      equipmentProfile,
      maxLevel: state.settings.maxLevel,
    })
  }, [exercise, exercisesIndex, state.settings.equipmentProfiles, state.settings.activeProfile, state.settings.maxLevel, state.customExercises])

  if (!exercise) {
    return <Drawer open={open} onClose={onClose} title="Exercise" />
  }

  const sortedSub = Object.entries(exercise.sub || {}).sort((a, b) => b[1] - a[1])
  const previewValues = peakNormalize(exercise.sub)

  function handleDelete() {
    if (window.confirm(`Delete "${exercise.name}"? Routines and history that reference it keep working.`)) {
      dispatch({ type: 'DELETE_CUSTOM_EXERCISE', exerciseId: exercise.id })
      onClose()
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title={exercise.name}>
      <div className="sx-detail-images">
        <ExerciseImage src={exercise.images[0] && `${IMG_BASE}${exercise.images[0]}`} />
        <ExerciseImage src={exercise.images[1] && `${IMG_BASE}${exercise.images[1]}`} />
      </div>

      <button
        type="button"
        className="sx-favorite-toggle"
        aria-pressed={state.favorites.includes(exercise.id)}
        onClick={() => dispatch({ type: 'TOGGLE_FAVORITE', exerciseId: exercise.id })}
      >
        {state.favorites.includes(exercise.id) ? '★ Favorited' : '☆ Favorite'}
      </button>

      <div className="sx-detail-meta">
        <MetaItem label="Equipment" value={label(exercise.equipment)} />
        <MetaItem label="Level" value={label(exercise.level)} />
        <MetaItem label="Mechanic" value={label(exercise.mechanic)} />
        <MetaItem label="Force" value={label(exercise.force)} />
      </div>

      <span className="sx-eyebrow">
        {exercise.custom ? 'Custom exercise' : exercise.reviewed ? 'Reviewed' : 'Auto-mapped'}
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

      {substitutes.length > 0 && (
        <>
          <h3>Substitutes</h3>
          <ul className="sx-substitutes-list">
            {substitutes.map(({ exercise: sub }) => (
              <li key={sub.id}>
                <button type="button" onClick={() => onSelectExercise?.(sub)}>
                  {sub.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

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

      {exercise.custom && (
        <button type="button" onClick={handleDelete}>
          Delete custom exercise
        </button>
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
