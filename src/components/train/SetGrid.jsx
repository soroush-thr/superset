import React, { useState } from 'react'
import { toDisplay, fromDisplay, formatWeight } from '../../lib/units.js'
import { suggestNextLoad } from '../../lib/progression.js'

function lastSetDefaults(entry) {
  const last = entry.sets[entry.sets.length - 1]
  return last ? { weightKg: last.weightKg, reps: last.reps, rpe: last.rpe, setType: last.setType } : {}
}

/**
 * One entry's logged sets: a row per set (weight/reps/RPE/done), plus a
 * "Log set" button that appends a new one prefilled from the last set so
 * repeating the same weight across sets is a single tap. Plain numeric
 * inputs, not NumberField -- +/- steppers are the wrong control for typing
 * a gym weight. `previousSession` (the { session, entry, sets } shape from
 * lastSessionFor) drives the dismissible "bump the weight" hint.
 */
export default function SetGrid({ sessionId, entry, unit, dispatch, onSetLogged, previousSession }) {
  const [hintDismissed, setHintDismissed] = useState(false)
  const suggestion = hintDismissed ? null : suggestNextLoad(previousSession, entry.targetRepMax, unit)

  return (
    <div className="sx-set-grid">
      {(entry.targetSets || entry.targetRepMin != null || entry.targetRepMax != null) && (
        <p className="sx-helper-text">
          Target: {entry.targetSets ?? '-'} sets of {entry.targetRepMin ?? '-'}-{entry.targetRepMax ?? '-'} reps
        </p>
      )}

      {suggestion && (
        <div className="sx-progression-hint">
          <span>You hit the top of your rep range last time -- try {formatWeight(suggestion.weightKg, unit)}?</span>
          <button type="button" onClick={() => setHintDismissed(true)}>
            Dismiss
          </button>
        </div>
      )}

      {entry.sets.map((set, i) => (
        <SetRow
          key={set.id}
          index={i}
          set={set}
          unit={unit}
          onChange={(patch) =>
            dispatch({ type: 'UPDATE_SET', sessionId, entryId: entry.id, setId: set.id, patch })
          }
          onDelete={() => dispatch({ type: 'DELETE_SET', sessionId, entryId: entry.id, setId: set.id })}
        />
      ))}

      <button
        type="button"
        className="sx-primary"
        onClick={() => {
          dispatch({
            type: 'LOG_SET',
            sessionId,
            entryId: entry.id,
            set: { done: true, ...lastSetDefaults(entry) },
          })
          onSetLogged?.()
        }}
      >
        Log set {entry.sets.length + 1}
      </button>
    </div>
  )
}

function SetRow({ index, set, unit, onChange, onDelete }) {
  const [weightText, setWeightText] = useState(() =>
    set.weightKg == null ? '' : String(toDisplay(set.weightKg, unit)),
  )

  function commitWeight() {
    const n = parseFloat(weightText)
    onChange({ weightKg: Number.isFinite(n) ? fromDisplay(n, unit) : null })
  }

  return (
    <div className={`sx-set-row${set.done ? ' sx-set-row-done' : ''}`}>
      <span className="sx-num sx-set-index">{index + 1}</span>
      <input
        className="sx-input sx-set-weight"
        inputMode="decimal"
        placeholder={unit}
        aria-label={`Set ${index + 1} weight (${unit})`}
        value={weightText}
        onChange={(e) => setWeightText(e.target.value)}
        onBlur={commitWeight}
      />
      <input
        className="sx-input sx-set-reps"
        inputMode="numeric"
        placeholder="reps"
        aria-label={`Set ${index + 1} reps`}
        value={set.reps ?? ''}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10)
          onChange({ reps: Number.isFinite(n) ? n : null })
        }}
      />
      <input
        className="sx-input sx-set-rpe"
        inputMode="decimal"
        placeholder="RPE"
        aria-label={`Set ${index + 1} RPE`}
        value={set.rpe ?? ''}
        onChange={(e) => {
          const n = parseFloat(e.target.value)
          onChange({ rpe: Number.isFinite(n) ? n : null })
        }}
      />
      <label className="sx-set-done">
        <input type="checkbox" checked={set.done} onChange={(e) => onChange({ done: e.target.checked })} />
        Done
      </label>
      <button type="button" aria-label={`Delete set ${index + 1}`} onClick={onDelete}>
        &times;
      </button>
    </div>
  )
}
