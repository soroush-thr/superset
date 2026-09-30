import React, { useEffect, useState } from 'react'
import { toDisplay, fromDisplay, formatWeight } from '../../lib/units.js'
import { suggestNextLoad } from '../../lib/progression.js'

/**
 * One entry's sets as a compact checklist: a row per planned set with
 * weight, reps and a big tick. Ticking a set fills any blank weight/reps
 * from the previous set (or last session, or the target), copies the weight
 * to the rows below, and starts the rest timer. Planned entries have a fixed
 * number of rows; ad-hoc entries can add more. `previousSession` (the
 * { session, entry, sets } shape from lastSessionFor) drives the dismissible
 * "bump the weight" hint.
 */
export default function SetGrid({ sessionId, entry, unit, dispatch, onSetLogged, previousSession }) {
  const [hintDismissed, setHintDismissed] = useState(false)
  const suggestion = hintDismissed ? null : suggestNextLoad(previousSession, entry.targetRepMax, unit)
  // A planned entry has a fixed number of sets; ad-hoc entries are open-ended.
  const canAdd = entry.targetSets == null || entry.sets.length < entry.targetSets
  const repsLabel = entry.targetUnit === 'sec' ? 'sec' : 'reps'
  const repsPlaceholder =
    entry.targetRepMin != null && entry.targetRepMax != null
      ? entry.targetRepMin === entry.targetRepMax
        ? String(entry.targetRepMin)
        : `${entry.targetRepMin}-${entry.targetRepMax}`
      : repsLabel

  const update = (setId, patch) => dispatch({ type: 'UPDATE_SET', sessionId, entryId: entry.id, setId, patch })

  function toggleDone(set, index) {
    if (set.done) {
      update(set.id, { done: false })
      return
    }
    const prev = [...entry.sets.slice(0, index)].reverse().find((s) => s.done)
    const fromLast = previousSession?.sets[index] ?? previousSession?.sets[previousSession.sets.length - 1]
    const weightKg = set.weightKg ?? prev?.weightKg ?? fromLast?.weightKg ?? null
    const reps = set.reps ?? prev?.reps ?? fromLast?.reps ?? entry.targetRepMax ?? null
    update(set.id, { done: true, weightKg, reps, ts: new Date().toISOString() })
    if (weightKg != null) {
      for (const later of entry.sets.slice(index + 1)) {
        if (!later.done && later.weightKg == null) update(later.id, { weightKg })
      }
    }
    onSetLogged?.()
  }

  return (
    <div className="sx-set-grid">
      {suggestion && (
        <div className="sx-progression-hint">
          <span>Top of the range last time. Try {formatWeight(suggestion.weightKg, unit)}?</span>
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
          repsLabel={repsLabel}
          repsPlaceholder={repsPlaceholder}
          removable={entry.targetSets == null || entry.sets.length > entry.targetSets}
          onChange={(patch) => update(set.id, patch)}
          onToggle={() => toggleDone(set, i)}
          onDelete={() => dispatch({ type: 'DELETE_SET', sessionId, entryId: entry.id, setId: set.id })}
        />
      ))}

      {canAdd && (
        <button
          type="button"
          className="sx-add-set"
          onClick={() =>
            dispatch({
              type: 'LOG_SET',
              sessionId,
              entryId: entry.id,
              set: {
                done: false,
                weightKg: entry.sets[entry.sets.length - 1]?.weightKg ?? null,
              },
            })
          }
        >
          + Add set
        </button>
      )}
    </div>
  )
}

function SetRow({ index, set, unit, repsLabel, repsPlaceholder, removable, onChange, onToggle, onDelete }) {
  const [weightText, setWeightText] = useState(() =>
    set.weightKg == null ? '' : String(toDisplay(set.weightKg, unit)),
  )
  // Keep the field in step with changes made elsewhere (carry-forward, unit toggle).
  useEffect(() => {
    setWeightText(set.weightKg == null ? '' : String(Math.round(toDisplay(set.weightKg, unit) * 10) / 10))
  }, [set.weightKg, unit])

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
        placeholder={repsPlaceholder}
        aria-label={`Set ${index + 1} ${repsLabel}`}
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
      <button
        type="button"
        className={`sx-set-tick${set.done ? ' sx-done' : ''}`}
        aria-pressed={set.done}
        aria-label={`Set ${index + 1} ${set.done ? 'done, tap to undo' : 'mark done'}`}
        onClick={onToggle}
      >
        ✓
      </button>
      {removable ? (
        <button type="button" className="sx-set-remove" aria-label={`Delete set ${index + 1}`} onClick={onDelete}>
          &times;
        </button>
      ) : (
        <span />
      )}
    </div>
  )
}
