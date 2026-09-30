import React, { useMemo, useState } from 'react'
import ExerciseThumb from './ui/ExerciseThumb.jsx'
import { useStore, useBodyMapFeed, useExercises } from '../App.jsx'
import { weeklyVolume, substitutesFor } from '../lib/coverage.js'
import { useDebounced } from '../lib/hooks.js'
import { equipmentOptionsFor, allEquipment } from '../lib/equipment.js'
import { TEMPLATES } from '../lib/templates.js'
import { encodeRoutine } from '../lib/share.js'
import { weeksWithDefault } from '../lib/store.js'
import { SET_TYPES } from '../lib/constants.js'
import NumberField from './ui/NumberField.jsx'

function formatFrequency(cycleDays) {
  const factor = 7 / cycleDays
  if (Math.abs(factor - 1) < 1e-9) return 'each day runs once per week.'
  return `each day runs ${factor.toFixed(2)} times per week.`
}

// Drag-and-drop slot reordering (section 4.3) -- layered on top of the
// day up/down buttons, not a replacement (BUILD-PLAN.md: those were chosen
// deliberately as "far more reliable on touch"; native HTML5 drag-and-drop
// barely works on touch at all, so this only ever activates for pointer
// devices anyway).
const SLOT_DRAG_MIME = 'application/x-superset-slot'

function readSlotDragData(e) {
  const raw = e.dataTransfer.getData(SLOT_DRAG_MIME)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Section 9.3. Routine CRUD, day cards (up/down reorder, not drag -- "far
 * more reliable on touch"), slot/entry editing, and the "Make superset" /
 * "Split" pair (section 1a: stored type is "paired", UI label "Superset").
 * Feeds the shell's sticky body map via useBodyMapFeed, debounced 80ms so
 * rapid keystrokes don't recompute on every character.
 */
export default function RoutineBuilder() {
  const { state, dispatch } = useStore()
  const { byId: exercisesById } = useExercises()
  const routine = state.routines.find((r) => r.id === state.activeRoutineId)
  const debouncedRoutine = useDebounced(routine, 80)

  const volume = useMemo(() => {
    if (!debouncedRoutine) return {}
    return weeklyVolume(debouncedRoutine, exercisesById, state.settings.creditMode)
  }, [debouncedRoutine, state.settings.creditMode, exercisesById])

  useBodyMapFeed(useMemo(() => ({ front: volume, back: volume }), [volume]))

  if (state.routines.length === 0) {
    return (
      <div>
        <span className="sx-eyebrow">Routine builder</span>
        <h2>No routines yet</h2>
        <button
          type="button"
          className="sx-primary"
          onClick={() => dispatch({ type: 'CREATE_ROUTINE', name: 'My Routine' })}
        >
          Create routine
        </button>
        <p className="sx-helper-text">Or start from a template:</p>
        <div className="sx-chip-row">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => dispatch({ type: 'INSTANTIATE_TEMPLATE', templateId: t.id })}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <span className="sx-eyebrow">Routine builder</span>
      <RoutineSelector state={state} dispatch={dispatch} routine={routine} />
      {routine && <RoutineEditor routine={routine} dispatch={dispatch} exercisesById={exercisesById} />}
    </div>
  )
}

function RoutineSelector({ state, dispatch, routine }) {
  return (
    <div className="sx-routine-selector">
      <select
        className="sx-input"
        value={state.activeRoutineId ?? ''}
        onChange={(e) => dispatch({ type: 'SET_ACTIVE_ROUTINE', routineId: e.target.value })}
      >
        {state.routines.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => dispatch({ type: 'CREATE_ROUTINE', name: 'New Routine' })}>
        New
      </button>
      <select
        className="sx-input"
        value=""
        onChange={(e) => {
          if (e.target.value) dispatch({ type: 'INSTANTIATE_TEMPLATE', templateId: e.target.value })
          e.target.value = ''
        }}
      >
        <option value="">New from template...</option>
        {TEMPLATES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      {routine && (
        <>
          <button
            type="button"
            onClick={() => {
              const name = window.prompt('Rename routine', routine.name)
              if (name) dispatch({ type: 'RENAME_ROUTINE', routineId: routine.id, name })
            }}
          >
            Rename
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'DUPLICATE_ROUTINE', routineId: routine.id })}
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete "${routine.name}"? This cannot be undone.`)) {
                dispatch({ type: 'DELETE_ROUTINE', routineId: routine.id })
              }
            }}
          >
            Delete
          </button>
          <button type="button" onClick={() => window.print()}>
            Print
          </button>
          <ShareButton routine={routine} />
        </>
      )}
    </div>
  )
}

function ShareButton({ routine }) {
  const [state, setState] = useState('idle') // idle | copied | fallback | error
  const [fallbackText, setFallbackText] = useState('')

  async function handleShare() {
    setState('idle')
    let url
    try {
      const result = await encodeRoutine(routine)
      if (!result) {
        setFallbackText(JSON.stringify(routine))
        setState('fallback')
        return
      }
      url = `${location.origin}${location.pathname}#share=${result.compressed ? 1 : 0}.${result.encoded}`
    } catch (err) {
      console.error('Failed to encode routine for sharing:', err)
      setState('error')
      return
    }

    // Encoding succeeded even if the clipboard write below fails (denied
    // permission, insecure context, etc.) -- that's not a hard failure, it
    // just means falling back to a copyable field instead of a toast.
    try {
      if (!navigator.clipboard?.writeText || location.protocol === 'file:') {
        throw new Error('Clipboard API unavailable')
      }
      await navigator.clipboard.writeText(url)
      setState('copied')
    } catch {
      setFallbackText(url)
      setState('fallback')
    }
  }

  return (
    <span className="sx-share">
      <button type="button" onClick={handleShare}>
        Share
      </button>
      {state === 'copied' && <span className="sx-helper-text">Link copied.</span>}
      {state === 'error' && <span className="sx-helper-text">Couldn't create a share link.</span>}
      {state === 'fallback' && (
        <label className="sx-field">
          <span className="sx-eyebrow">Copy this link/text to share</span>
          <textarea
            className="sx-input sx-share-fallback"
            readOnly
            value={fallbackText}
            onFocus={(e) => e.target.select()}
          />
        </label>
      )}
    </span>
  )
}

function RoutineEditor({ routine, dispatch, exercisesById }) {
  return (
    <div>
      <div className="sx-cycle-days">
        <NumberField
          label="Cycle days"
          value={routine.cycleDays}
          min={1}
          max={28}
          onChange={(v) => dispatch({ type: 'SET_CYCLE_DAYS', routineId: routine.id, cycleDays: v })}
        />
        <p className="sx-helper-text">
          {routine.days.length} day{routine.days.length === 1 ? '' : 's'} over a{' '}
          {routine.cycleDays} day cycle means {formatFrequency(routine.cycleDays)}
        </p>
      </div>

      <WeeksEditor routine={routine} dispatch={dispatch} />

      {routine.days.map((day, i) => (
        <DayCard
          key={day.id}
          routine={routine}
          day={day}
          index={i}
          dayCount={routine.days.length}
          dispatch={dispatch}
          exercisesById={exercisesById}
        />
      ))}

      <button
        type="button"
        onClick={() =>
          dispatch({ type: 'ADD_DAY', routineId: routine.id, name: `Day ${routine.days.length + 1}` })
        }
      >
        Add day
      </button>
    </div>
  )
}

/**
 * Section 4.4: an optional deload cycle. Each week is a % of the plan's
 * volume -- e.g. 100, 100, 100, 50 runs three normal weeks then a half-volume
 * deload. Deliberately modest: a flat multiplier per week, not a full
 * periodization engine. Coverage lets you preview any week; absent or a
 * single 100% week (the default) changes nothing.
 */
function WeeksEditor({ routine, dispatch }) {
  const weeks = weeksWithDefault(routine)

  function setWeeks(next) {
    dispatch({ type: 'SET_ROUTINE_WEEKS', routineId: routine.id, weeks: next })
  }

  return (
    <div className="sx-field sx-weeks-editor">
      <span className="sx-eyebrow">Weeks (deload cycle)</span>
      <p className="sx-helper-text">
        Optional. Add a week per phase and set its volume as a % of this plan -- e.g. 100/100/100/50 for a deload
        every 4th week.
      </p>
      <div className="sx-weeks-row">
        {weeks.map((w, i) => (
          <div key={i} className="sx-week-item">
            <NumberField
              label={`Week ${i + 1}`}
              value={Math.round(w * 100)}
              min={0}
              max={200}
              step={25}
              onChange={(v) => setWeeks(weeks.map((existing, idx) => (idx === i ? v / 100 : existing)))}
            />
            {weeks.length > 1 && (
              <button
                type="button"
                aria-label={`Remove week ${i + 1}`}
                onClick={() => setWeeks(weeks.filter((_, idx) => idx !== i))}
              >
                &times;
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => setWeeks([...weeks, 1])}>
          Add week
        </button>
      </div>
    </div>
  )
}

function DayCard({ routine, day, index, dayCount, dispatch, exercisesById }) {
  const totalSets = day.slots.reduce(
    (sum, slot) => sum + slot.entries.reduce((s, e) => s + (e.sets || 0), 0),
    0,
  )

  return (
    <div className="sx-day-card">
      <div className="sx-day-card-header">
        <input
          className="sx-input sx-day-name"
          value={day.name}
          onChange={(e) =>
            dispatch({
              type: 'UPDATE_DAY',
              routineId: routine.id,
              dayId: day.id,
              patch: { name: e.target.value },
            })
          }
        />
        <span className="sx-eyebrow sx-num">{totalSets} sets</span>
        <button
          type="button"
          aria-label="Move day up"
          disabled={index === 0}
          onClick={() =>
            dispatch({ type: 'REORDER_DAY', routineId: routine.id, dayId: day.id, direction: -1 })
          }
        >
          &uarr;
        </button>
        <button
          type="button"
          aria-label="Move day down"
          disabled={index === dayCount - 1}
          onClick={() =>
            dispatch({ type: 'REORDER_DAY', routineId: routine.id, dayId: day.id, direction: 1 })
          }
        >
          &darr;
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete "${day.name}"?`)) {
              dispatch({ type: 'DELETE_DAY', routineId: routine.id, dayId: day.id })
            }
          }}
        >
          Delete
        </button>
      </div>

      <div
        className="sx-day-slots"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const dragged = readSlotDragData(e)
          if (!dragged || dragged.dayId === day.id) return
          dispatch({
            type: 'MOVE_SLOT',
            routineId: routine.id,
            fromDayId: dragged.dayId,
            slotId: dragged.slotId,
            toDayId: day.id,
            toIndex: day.slots.length,
          })
        }}
      >
        {day.slots.length === 0 ? (
          <p className="sx-empty-state">Add exercises to this day from the Library, or drag one in.</p>
        ) : (
          day.slots.map((slot, i) => (
            <SlotEditor
              key={slot.id}
              routine={routine}
              day={day}
              slot={slot}
              canMergeWithNext={i + 1 < day.slots.length}
              dispatch={dispatch}
              exercisesById={exercisesById}
            />
          ))
        )}
      </div>
    </div>
  )
}

function SlotEditor({ routine, day, slot, canMergeWithNext, dispatch, exercisesById }) {
  const isPaired = slot.type === 'paired'

  function handleDragStart(e) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(SLOT_DRAG_MIME, JSON.stringify({ dayId: day.id, slotId: slot.id }))
  }

  function handleDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    const dragged = readSlotDragData(e)
    if (!dragged || dragged.slotId === slot.id) return
    const toIndex = day.slots.findIndex((s) => s.id === slot.id)
    if (dragged.dayId === day.id) {
      const fromIndex = day.slots.findIndex((s) => s.id === dragged.slotId)
      if (fromIndex === -1) return
      dispatch({ type: 'REORDER_SLOT', routineId: routine.id, dayId: day.id, fromIndex, toIndex })
    } else {
      dispatch({
        type: 'MOVE_SLOT',
        routineId: routine.id,
        fromDayId: dragged.dayId,
        slotId: dragged.slotId,
        toDayId: day.id,
        toIndex,
      })
    }
  }

  return (
    <div
      className={`sx-slot${isPaired ? ' sx-slot-paired' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <span className="sx-slot-drag-handle" aria-hidden="true" title="Drag to reorder">
        &#8942;&#8942;
      </span>
      {isPaired && <span className="sx-eyebrow sx-slot-paired-label">Superset</span>}
      {slot.entries.map((entry, entryIndex) => (
        <EntryEditor
          key={entryIndex}
          routine={routine}
          day={day}
          slot={slot}
          entry={entry}
          entryIndex={entryIndex}
          dispatch={dispatch}
          exercisesById={exercisesById}
        />
      ))}
      <div className="sx-slot-actions">
        {isPaired ? (
          <button
            type="button"
            onClick={() =>
              dispatch({
                type: 'SPLIT_PAIRED_SLOT',
                routineId: routine.id,
                dayId: day.id,
                slotId: slot.id,
              })
            }
          >
            Split
          </button>
        ) : (
          canMergeWithNext && (
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: 'MERGE_SLOTS_AS_PAIRED',
                  routineId: routine.id,
                  dayId: day.id,
                  slotId: slot.id,
                })
              }
            >
              Make superset
            </button>
          )
        )}
        <button
          type="button"
          onClick={() =>
            dispatch({ type: 'DELETE_SLOT', routineId: routine.id, dayId: day.id, slotId: slot.id })
          }
        >
          Remove
        </button>
      </div>
    </div>
  )
}

function EntryEditor({ routine, day, slot, entry, entryIndex, dispatch, exercisesById }) {
  const exercise = exercisesById[entry.exerciseId]
  const { state } = useStore()
  const exercisesIndex = useExercises()

  const substitutes = useMemo(() => {
    const equipmentProfile = equipmentOptionsFor(
      state.settings.equipmentProfiles,
      state.settings.activeProfile,
      allEquipment(state.customExercises),
    )
    return substitutesFor(entry.exerciseId, {
      index: exercisesIndex,
      equipmentProfile,
      maxLevel: state.settings.maxLevel,
    })
  }, [
    entry.exerciseId,
    exercisesIndex,
    state.settings.equipmentProfiles,
    state.settings.activeProfile,
    state.settings.maxLevel,
    state.customExercises,
  ])

  function patch(fields) {
    dispatch({
      type: 'UPDATE_ENTRY',
      routineId: routine.id,
      dayId: day.id,
      slotId: slot.id,
      entryIndex,
      patch: fields,
    })
  }

  return (
    <div className="sx-entry">
      <div className="sx-entry-header">
        <ExerciseThumb exercise={exercise} size="sm" />
        <span className="sx-entry-name sx-entry-name-grow">{exercise?.name ?? entry.exerciseId}</span>
        {substitutes.length > 0 && (
          <select
            className="sx-input sx-entry-swap"
            value=""
            onChange={(e) => {
              if (e.target.value) patch({ exerciseId: e.target.value })
              e.target.value = ''
            }}
          >
            <option value="">Swap for...</option>
            {substitutes.map(({ exercise: sub }) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="sx-entry-fields">
        <NumberField label="Sets" value={entry.sets} min={1} max={20} onChange={(v) => patch({ sets: v })} />
        <NumberField
          label="Rep min"
          value={entry.repMin}
          min={0}
          max={100}
          onChange={(v) => patch({ repMin: v })}
        />
        <NumberField
          label="Rep max"
          value={entry.repMax}
          min={0}
          max={100}
          onChange={(v) => patch({ repMax: v })}
        />
        <NumberField
          label="Rest (s)"
          value={entry.restSec}
          min={0}
          max={600}
          step={15}
          onChange={(v) => patch({ restSec: v })}
        />
        <NumberField
          label="RPE"
          value={entry.rpe}
          min={0}
          max={10}
          onChange={(v) => patch({ rpe: v })}
        />
        <label className="sx-field">
          <span className="sx-eyebrow">Tempo</span>
          <input
            className="sx-input"
            value={entry.tempo}
            onChange={(e) => patch({ tempo: e.target.value })}
          />
        </label>
        <label className="sx-field">
          <span className="sx-eyebrow">Set type</span>
          <select
            className="sx-input"
            value={entry.setType}
            onChange={(e) => patch({ setType: e.target.value })}
          >
            {SET_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="sx-field sx-field-note">
          <span className="sx-eyebrow">Note</span>
          <input
            className="sx-input"
            value={entry.note}
            onChange={(e) => patch({ note: e.target.value })}
          />
        </label>
      </div>
    </div>
  )
}
