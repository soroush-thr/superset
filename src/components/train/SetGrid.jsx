import React, { useState } from 'react'
import { formatWeight } from '../../lib/units.js'
import { suggestNextLoad } from '../../lib/progression.js'
import { weightOptionsKg, weightLabel, nearestIndex, sameWeight, isBodyweight } from '../../lib/weights.js'
import Stepper from '../ui/Stepper.jsx'

const RPE_CHOICES = [6, 7, 8, 9, 10]

/**
 * One entry's sets as a tap-first checklist. Each row shows a weight and
 * reps that are already filled in (from the previous set, last session, or
 * the target -- shown faint until confirmed), so logging is: nudge with
 * − / + or pick from the weight dropdown if anything changed, tap an RPE,
 * tick. Ticking commits the shown values, copies the weight to the rows
 * below, and starts the rest timer. The weight dropdown offers the sizes
 * you own for dumbbells/kettlebells (settings.ownedWeights), else sensible
 * increments. Planned entries have a fixed number of rows; ad-hoc entries
 * can add more. `previousSession` (lastSessionFor's shape) drives the
 * "bump the weight" hint.
 */
export default function SetGrid({
  sessionId,
  entry,
  exercise,
  unit,
  ownedWeights,
  dispatch,
  onSetLogged,
  onRpeChanged,
  previousSession,
}) {
  const [hintDismissed, setHintDismissed] = useState(false)
  const suggestion = hintDismissed ? null : suggestNextLoad(previousSession, entry.targetRepMax, unit)
  const canAdd = entry.targetSets == null || entry.sets.length < entry.targetSets
  const sec = entry.targetUnit === 'sec'
  const cooldown = entry.kind === 'cooldown'
  const equipment = exercise?.equipment

  const update = (setId, patch) => dispatch({ type: 'UPDATE_SET', sessionId, entryId: entry.id, setId, patch })

  // What each row shows before the user touches it.
  function suggested(index) {
    const set = entry.sets[index]
    const earlier = entry.sets.slice(0, index).reverse()
    const fromLast = previousSession?.sets[index] ?? previousSession?.sets[previousSession.sets.length - 1]
    const weightKg =
      set.weightKg ??
      earlier.find((s) => s.weightKg != null)?.weightKg ??
      fromLast?.weightKg ??
      null
    const reps =
      set.reps ??
      earlier.find((s) => s.done && s.reps != null)?.reps ??
      fromLast?.reps ??
      entry.targetRepMax ??
      (sec ? 30 : 10)
    return { weightKg, reps }
  }

  function toggleDone(set, index) {
    if (set.done) {
      update(set.id, { done: false })
      return
    }
    const { weightKg, reps } = suggested(index)
    const ts = new Date().toISOString()
    update(set.id, { done: true, weightKg, reps, ts })
    if (weightKg != null) {
      for (const later of entry.sets.slice(index + 1)) {
        if (!later.done && later.weightKg == null) update(later.id, { weightKg })
      }
    }
    onSetLogged?.({ ...set, done: true, weightKg, reps, ts })
  }

  function setWeight(set, index, weightKg) {
    const before = suggested(index).weightKg
    update(set.id, { weightKg })
    // Carry the change down to later sets that were on the same weight
    // (a planned drop or pyramid set keeps its own).
    for (const later of entry.sets.slice(index + 1)) {
      if (!later.done && (later.weightKg == null || sameWeight(later.weightKg, before))) {
        update(later.id, { weightKg })
      }
    }
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

      {!cooldown && entry.sets.length > 0 && (
        <div className="sx-set-head sx-eyebrow" aria-hidden="true">
          <span>Set</span>
          <span>{isBodyweight(equipment) ? `Added ${unit}` : equipment === 'dumbbell' ? `${unit} each` : unit}</span>
          <span>{sec ? 'Seconds' : 'Reps'}</span>
          <span className="sx-set-head-rpe">RPE</span>
          <span>Done</span>
        </div>
      )}

      {entry.sets.map((set, i) =>
        cooldown ? (
          <div key={set.id} className={`sx-set-row sx-set-row-simple${set.done ? ' sx-set-row-done' : ''}`}>
            <span className="sx-num sx-set-index">{i + 1}</span>
            <span className="sx-helper-text">{entry.note || 'Hold the stretch'}</span>
            <TickButton set={set} index={i} onClick={() => toggleDone(set, i)} />
          </div>
        ) : (
          <SetRow
            key={set.id}
            index={i}
            set={set}
            shown={suggested(i)}
            sec={sec}
            unit={unit}
            equipment={equipment}
            ownedWeights={ownedWeights}
            removable={entry.targetSets == null || entry.sets.length > entry.targetSets}
            onWeight={(kg) => setWeight(set, i, kg)}
            onReps={(reps) => update(set.id, { reps })}
            onRpe={(rpe) => {
              update(set.id, { rpe })
              if (set.done) onRpeChanged?.({ ...set, rpe })
            }}
            onToggle={() => toggleDone(set, i)}
            onDelete={() => dispatch({ type: 'DELETE_SET', sessionId, entryId: entry.id, setId: set.id })}
          />
        ),
      )}

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

function TickButton({ set, index, onClick }) {
  return (
    <button
      type="button"
      className={`sx-set-tick${set.done ? ' sx-done' : ''}`}
      aria-pressed={set.done}
      aria-label={`Set ${index + 1} ${set.done ? 'done, tap to undo' : 'mark done'}`}
      onClick={onClick}
    >
      ✓
    </button>
  )
}

function SetRow({ index, set, shown, sec, unit, equipment, ownedWeights, removable, onWeight, onReps, onRpe, onToggle, onDelete }) {
  const bodyweight = isBodyweight(equipment)
  // Bodyweight moves default to "BW" (no added load) rather than blank.
  const weightKg = shown.weightKg ?? (bodyweight ? 0 : null)
  const options = weightOptionsKg(equipment, unit, ownedWeights, weightKg)
  const at = weightKg == null ? -1 : options.findIndex((kg) => sameWeight(kg, weightKg))
  const weightGuessed = set.weightKg == null && !set.done
  const repsGuessed = set.reps == null && !set.done
  const repStep = sec ? 5 : 1

  function stepWeight(d) {
    if (!options.length) return
    let i
    if (at < 0) {
      // Nothing yet: start on a typical empty bar for barbells, else the lightest.
      i = equipment === 'barbell' ? nearestIndex(options, unit === 'lb' ? 45 * 0.45359237 : 20) : 0
    } else {
      i = Math.min(options.length - 1, Math.max(0, at + d))
    }
    onWeight(options[i])
  }

  return (
    <div className={`sx-set-row${set.done ? ' sx-set-row-done' : ''}`}>
      <span className="sx-num sx-set-index">{index + 1}</span>

      <Stepper
        label={`set ${index + 1} weight`}
        className={`sx-set-weight${weightGuessed ? ' sx-suggested' : ''}`}
        decDisabled={at === 0}
        incDisabled={at === options.length - 1}
        onDec={() => stepWeight(-1)}
        onInc={() => stepWeight(1)}
      >
        <select
          aria-label={`Set ${index + 1} weight (${unit})`}
          value={at < 0 ? '' : String(at)}
          onChange={(e) => onWeight(e.target.value === '' ? null : options[Number(e.target.value)])}
        >
          {at < 0 && <option value="">–</option>}
          {options.map((kg, i) => (
            <option key={i} value={String(i)}>
              {weightLabel(kg, unit, equipment)}
            </option>
          ))}
        </select>
      </Stepper>

      <Stepper
        label={`set ${index + 1} ${sec ? 'seconds' : 'reps'}`}
        className={`sx-set-reps${repsGuessed ? ' sx-suggested' : ''}`}
        decDisabled={shown.reps <= repStep}
        onDec={() => onReps(Math.max(repStep, shown.reps - repStep))}
        onInc={() => onReps(shown.reps + repStep)}
      >
        {shown.reps}
      </Stepper>

      <TickButton set={set} index={index} onClick={onToggle} />

      <div className="sx-set-rpe" role="radiogroup" aria-label={`Set ${index + 1} RPE (effort)`}>
        <span className="sx-eyebrow" title="Rate of perceived exertion: 10 = nothing left, 8 = two reps left">
          RPE
        </span>
        {RPE_CHOICES.map((v) => {
          const active = set.rpe != null && Math.round(set.rpe) === v
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={active}
              className={`sx-rpe-chip sx-num${active ? ' sx-active' : ''}`}
              onClick={() => onRpe(active ? null : v)}
            >
              {v}
            </button>
          )
        })}
      </div>

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
