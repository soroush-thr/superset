import React, { useMemo } from 'react'
import { useStore, useBodyMapFeed, useExercises } from '../../App.jsx'
import { volumeForEntries } from '../../lib/coverage.js'
import { lastSessionFor } from '../../lib/sessions.js'
import { useWakeLock } from '../../lib/hooks.js'
import SetGrid from './SetGrid.jsx'
import LastTime from './LastTime.jsx'
import RestTimer from './RestTimer.jsx'

const DEFAULT_REST_SEC = 90

/**
 * The in-progress workout: start from a planned routine day (pre-fills
 * exercises and target sets) or start empty and add exercises as you go.
 * Feeds the shell's sticky body map with live logged volume, same as
 * RoutineBuilder and Coverage.
 */
export default function ActiveSession() {
  const { state, dispatch } = useStore()
  const { byId: exercisesById, list: exercisesList } = useExercises()
  const unit = state.settings.unit ?? 'kg'
  const session = state.sessions.find((s) => s.id === state.activeSessionId)

  useWakeLock(!!session)

  const volume = useMemo(() => {
    if (!session) return {}
    const loggedEntries = session.entries
      .map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.filter((s) => s.done).length }))
      .filter((e) => e.sets > 0)
    return volumeForEntries(loggedEntries, exercisesById, state.settings.creditMode)
  }, [session, exercisesById, state.settings.creditMode])

  useBodyMapFeed(useMemo(() => ({ front: volume, back: volume }), [volume]))

  if (!session) {
    return <StartSession state={state} dispatch={dispatch} />
  }

  return (
    <div className="sx-active-session">
      <SessionHeader session={session} dispatch={dispatch} />

      {session.restEndsAt && (
        <RestTimer
          restEndsAt={session.restEndsAt}
          onCancel={() => dispatch({ type: 'SET_REST_TIMER', sessionId: session.id, restEndsAt: null })}
        />
      )}

      {session.entries.length === 0 ? (
        <p className="sx-empty-state">Add an exercise below to start logging.</p>
      ) : (
        session.entries.map((entry) => (
          <SessionEntry
            key={entry.id}
            session={session}
            entry={entry}
            exercise={exercisesById[entry.exerciseId]}
            unit={unit}
            dispatch={dispatch}
            allSessions={state.sessions}
          />
        ))
      )}

      <AddExercise session={session} exercises={exercisesList} dispatch={dispatch} />
    </div>
  )
}

function StartSession({ state, dispatch }) {
  const routine = state.routines.find((r) => r.id === state.activeRoutineId)

  return (
    <div>
      <h2>No session in progress</h2>
      {routine && routine.days.length > 0 && (
        <div className="sx-field">
          <span className="sx-eyebrow">Start from {routine.name}</span>
          <div className="sx-chip-row">
            {routine.days.map((day) => (
              <button
                key={day.id}
                type="button"
                className="sx-primary"
                onClick={() => dispatch({ type: 'START_SESSION', routineId: routine.id, dayId: day.id })}
              >
                {day.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => dispatch({ type: 'START_SESSION', routineId: null, dayId: null })}
      >
        Start empty session
      </button>
    </div>
  )
}

function SessionHeader({ session, dispatch }) {
  return (
    <div className="sx-session-header">
      <div>
        <h2>{session.dayName || 'Ad-hoc session'}</h2>
        <span className="sx-eyebrow sx-num">
          Started{' '}
          {new Date(session.startedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <label className="sx-field sx-field-note">
        <span className="sx-eyebrow">Note</span>
        <input
          className="sx-input"
          value={session.note}
          onChange={(e) =>
            dispatch({ type: 'UPDATE_SESSION', sessionId: session.id, patch: { note: e.target.value } })
          }
        />
      </label>
      <div className="sx-session-actions">
        <button
          type="button"
          className="sx-primary"
          onClick={() => dispatch({ type: 'END_SESSION', sessionId: session.id })}
        >
          Finish
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Discard this session? This cannot be undone.')) {
              dispatch({ type: 'DISCARD_SESSION', sessionId: session.id })
            }
          }}
        >
          Discard
        </button>
      </div>
    </div>
  )
}

function SessionEntry({ session, entry, exercise, unit, dispatch, allSessions }) {
  const last = useMemo(
    () => lastSessionFor(allSessions, entry.exerciseId, { excludeSessionId: session.id }),
    [allSessions, entry.exerciseId, session.id],
  )

  function handleSetLogged() {
    const restSec = entry.targetRestSec ?? DEFAULT_REST_SEC
    dispatch({ type: 'SET_REST_TIMER', sessionId: session.id, restEndsAt: Date.now() + restSec * 1000 })
  }

  return (
    <div className="sx-entry sx-session-entry">
      <div className="sx-entry-header">
        <span className="sx-entry-name">{exercise?.name ?? entry.exerciseId}</span>
        <button
          type="button"
          onClick={() => dispatch({ type: 'DELETE_SESSION_ENTRY', sessionId: session.id, entryId: entry.id })}
        >
          Remove
        </button>
      </div>
      <LastTime last={last} unit={unit} />
      <SetGrid
        sessionId={session.id}
        entry={entry}
        unit={unit}
        dispatch={dispatch}
        onSetLogged={handleSetLogged}
        previousSession={last}
      />
    </div>
  )
}

function AddExercise({ session, exercises, dispatch }) {
  const sorted = useMemo(() => [...exercises].sort((a, b) => a.name.localeCompare(b.name)), [exercises])

  return (
    <label className="sx-field">
      <span className="sx-eyebrow">Add exercise</span>
      <select
        className="sx-input"
        value=""
        onChange={(e) => {
          if (e.target.value) {
            dispatch({ type: 'ADD_SESSION_ENTRY', sessionId: session.id, exerciseId: e.target.value })
          }
          e.target.value = ''
        }}
      >
        <option value="">Choose an exercise...</option>
        {sorted.map((ex) => (
          <option key={ex.id} value={ex.id}>
            {ex.name}
          </option>
        ))}
      </select>
    </label>
  )
}
