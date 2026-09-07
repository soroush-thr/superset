import React, { useMemo } from 'react'
import { useStore, useBodyMapFeed } from '../App.jsx'
import { weeklyVolume } from '../lib/coverage.js'
import { useDebounced } from '../lib/hooks.js'
import exercisesData from '../data/exercises.json'
import NumberField from './ui/NumberField.jsx'

const SET_TYPES = ['normal', 'dropset', 'myo', 'amrap', 'cluster', 'tut', 'isometric']

const EXERCISES_BY_ID = Object.fromEntries(exercisesData.map((e) => [e.id, e]))

function formatFrequency(cycleDays) {
  const factor = 7 / cycleDays
  if (Math.abs(factor - 1) < 1e-9) return 'each day runs once per week.'
  return `each day runs ${factor.toFixed(2)} times per week.`
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
  const routine = state.routines.find((r) => r.id === state.activeRoutineId)
  const debouncedRoutine = useDebounced(routine, 80)

  const volume = useMemo(() => {
    if (!debouncedRoutine) return {}
    return weeklyVolume(debouncedRoutine, EXERCISES_BY_ID, state.settings.creditMode)
  }, [debouncedRoutine, state.settings.creditMode])

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
      </div>
    )
  }

  return (
    <div>
      <span className="sx-eyebrow">Routine builder</span>
      <RoutineSelector state={state} dispatch={dispatch} routine={routine} />
      {routine && <RoutineEditor routine={routine} dispatch={dispatch} />}
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
        </>
      )}
    </div>
  )
}

function RoutineEditor({ routine, dispatch }) {
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

      {routine.days.map((day, i) => (
        <DayCard
          key={day.id}
          routine={routine}
          day={day}
          index={i}
          dayCount={routine.days.length}
          dispatch={dispatch}
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

function DayCard({ routine, day, index, dayCount, dispatch }) {
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

      {day.slots.length === 0 ? (
        <p className="sx-empty-state">Add exercises to this day from the Library.</p>
      ) : (
        day.slots.map((slot, i) => (
          <SlotEditor
            key={slot.id}
            routine={routine}
            day={day}
            slot={slot}
            canMergeWithNext={i + 1 < day.slots.length}
            dispatch={dispatch}
          />
        ))
      )}
    </div>
  )
}

function SlotEditor({ routine, day, slot, canMergeWithNext, dispatch }) {
  const isPaired = slot.type === 'paired'

  return (
    <div className={`sx-slot${isPaired ? ' sx-slot-paired' : ''}`}>
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

function EntryEditor({ routine, day, slot, entry, entryIndex, dispatch }) {
  const exercise = EXERCISES_BY_ID[entry.exerciseId]

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
      <span className="sx-entry-name">{exercise?.name ?? entry.exerciseId}</span>
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
