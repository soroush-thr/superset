import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, useBodyMapFeed, useExercises } from '../../App.jsx'
import { volumeForEntries } from '../../lib/coverage.js'
import { lastSessionFor } from '../../lib/sessions.js'
import { formatWeight } from '../../lib/units.js'
import { DEFAULT_BODY_KG, latestBodyKg, sessionKcal } from '../../lib/calories.js'
import { useWakeLock } from '../../lib/hooks.js'
import SetGrid from './SetGrid.jsx'
import RestTimer from './RestTimer.jsx'
import ExerciseThumb from '../ui/ExerciseThumb.jsx'
import ExerciseDetail from '../ExerciseDetail.jsx'

const DEFAULT_REST_SEC = 90

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

/** Re-render once a second while mounted (elapsed clock, live calories). */
function useNow(active) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return undefined
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

/**
 * The in-progress workout, laid out as a compact dashboard: a sticky bar
 * with the clock, progress, calories and rest timer, then every exercise as
 * a card (picture, target, last time, tick-off set rows) in a grid so the
 * whole session is visible at once. The next exercise to do is highlighted.
 * Feeds the shell's sticky body map with live logged volume.
 */
export default function ActiveSession() {
  const { state, dispatch } = useStore()
  const { byId: exercisesById, list: exercisesList } = useExercises()
  const unit = state.settings.unit ?? 'kg'
  const session = state.sessions.find((s) => s.id === state.activeSessionId)
  const [detailId, setDetailId] = useState(null)

  useWakeLock(!!session)
  const now = useNow(!!session)

  const volume = useMemo(() => {
    if (!session) return {}
    const loggedEntries = session.entries
      .filter((e) => e.kind !== 'cooldown')
      .map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.filter((s) => s.done).length }))
      .filter((e) => e.sets > 0)
    return volumeForEntries(loggedEntries, exercisesById, state.settings.creditMode)
  }, [session, exercisesById, state.settings.creditMode])

  useBodyMapFeed(useMemo(() => ({ front: volume, back: volume }), [volume]))

  // The "current" exercise is the first one with a set still to do. When it
  // changes because the user finished one, scroll the next into view.
  const currentId = session?.entries.find((e) => e.sets.some((s) => !s.done))?.id ?? null
  const cardRefs = useRef({})
  const previousCurrent = useRef(currentId)
  useEffect(() => {
    if (currentId && previousCurrent.current && currentId !== previousCurrent.current) {
      cardRefs.current[currentId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
    previousCurrent.current = currentId
  }, [currentId])

  if (!session) {
    return <StartSession state={state} dispatch={dispatch} />
  }

  const main = session.entries.filter((e) => e.kind !== 'cooldown')
  const totalSets = main.reduce((n, e) => n + e.sets.length, 0)
  const doneSets = main.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)
  const kcal = sessionKcal(session, exercisesById, latestBodyKg(state.bodyLog) ?? DEFAULT_BODY_KG, now)
  const detailExercise = detailId ? exercisesById[detailId] : null

  return (
    <div className="sx-active-session">
      <SessionBar
        session={session}
        dispatch={dispatch}
        elapsedMs={now - new Date(session.startedAt).getTime()}
        doneSets={doneSets}
        totalSets={totalSets}
        kcal={kcal}
      />

      {session.entries.length === 0 ? (
        <p className="sx-empty-state">Add an exercise below to start logging.</p>
      ) : (
        <div className="sx-session-grid">
          {session.entries.map((entry) => {
            const partners = entry.pairId ? session.entries.filter((e) => e.pairId === entry.pairId) : []
            const pairIndex = partners.indexOf(entry)
            return (
              <SessionEntry
                key={entry.id}
                cardRef={(el) => {
                  cardRefs.current[entry.id] = el
                }}
                session={session}
                entry={entry}
                pairLabel={pairIndex >= 0 ? `${entry.pairId}${pairIndex + 1}` : null}
                pairFirst={pairIndex >= 0 && pairIndex < partners.length - 1}
                current={entry.id === currentId}
                exercise={exercisesById[entry.exerciseId]}
                unit={unit}
                dispatch={dispatch}
                allSessions={state.sessions}
                onOpenDetail={() => setDetailId(entry.exerciseId)}
              />
            )
          })}
        </div>
      )}

      <AddExercise session={session} exercises={exercisesList} dispatch={dispatch} />

      <ExerciseDetail
        exercise={detailExercise}
        open={!!detailExercise}
        onClose={() => setDetailId(null)}
        onSelectExercise={(ex) => setDetailId(ex.id)}
      />
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

function SessionBar({ session, dispatch, elapsedMs, doneSets, totalSets, kcal }) {
  const pct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0
  return (
    <div className="sx-session-bar">
      <div className="sx-session-bar-top">
        <div className="sx-session-bar-title">
          <h2>{session.dayName || 'Ad-hoc session'}</h2>
          <span className="sx-eyebrow sx-num">
            {formatElapsed(elapsedMs)}
            {kcal != null ? ` · ~${kcal} kcal` : ''}
            {` · ${doneSets}/${totalSets} sets`}
          </span>
        </div>
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
      <div
        className="sx-session-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Sets completed"
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      {session.restEndsAt && (
        <RestTimer
          restEndsAt={session.restEndsAt}
          onCancel={() => dispatch({ type: 'SET_REST_TIMER', sessionId: session.id, restEndsAt: null })}
        />
      )}
      <details className="sx-session-note">
        <summary>{session.note ? 'Notes & warm-up' : 'Add a note'}</summary>
        <input
          className="sx-input"
          aria-label="Session note"
          value={session.note}
          onChange={(e) =>
            dispatch({ type: 'UPDATE_SESSION', sessionId: session.id, patch: { note: e.target.value } })
          }
        />
      </details>
    </div>
  )
}

function SessionEntry({
  session,
  entry,
  exercise,
  unit,
  dispatch,
  allSessions,
  pairLabel,
  pairFirst,
  current,
  cardRef,
  onOpenDetail,
}) {
  const last = useMemo(
    () => lastSessionFor(allSessions, entry.exerciseId, { excludeSessionId: session.id }),
    [allSessions, entry.exerciseId, session.id],
  )
  const done = entry.sets.filter((s) => s.done).length
  const complete = entry.sets.length > 0 && done === entry.sets.length
  const cooldown = entry.kind === 'cooldown'

  function handleSetLogged() {
    // No rest between superset partners (go straight to the next move) or
    // after a stretch.
    if (pairFirst || cooldown) return
    const restSec = entry.targetRestSec ?? DEFAULT_REST_SEC
    dispatch({ type: 'SET_REST_TIMER', sessionId: session.id, restEndsAt: Date.now() + restSec * 1000 })
  }

  function handleRemove() {
    if (done > 0 && !window.confirm(`Remove ${exercise?.name ?? 'this exercise'} and its logged sets?`)) return
    dispatch({ type: 'DELETE_SESSION_ENTRY', sessionId: session.id, entryId: entry.id })
  }

  const target =
    entry.targetSets != null
      ? `${entry.targetSets} × ${entry.targetRepMin ?? '-'}-${entry.targetRepMax ?? '-'} ${entry.targetUnit === 'sec' ? 'sec' : 'reps'}` +
        (entry.targetRestSec ? ` · rest ${entry.targetRestSec}s` : '')
      : null

  return (
    <div
      ref={cardRef}
      className={`sx-session-entry${pairLabel ? ' sx-superset' : ''}${current ? ' sx-current' : ''}${complete ? ' sx-complete' : ''}`}
    >
      <div className="sx-entry-top">
        <ExerciseThumb exercise={exercise} size="md" onClick={onOpenDetail} />
        <div className="sx-entry-info">
          <span className="sx-entry-name">
            {pairLabel && <span className="sx-superset-tag">{pairLabel}</span>}
            {cooldown && <span className="sx-superset-tag">Stretch</span>}
            {exercise?.name ?? entry.exerciseId}
          </span>
          {cooldown ? (
            <span className="sx-entry-meta">{entry.note}</span>
          ) : (
            target && <span className="sx-entry-meta sx-num">{target}</span>
          )}
          {last && (
            <span className="sx-entry-meta sx-num">
              Last: {last.sets.map((s) => `${formatWeight(s.weightKg, unit)}×${s.reps ?? '-'}`).join(', ')}
            </span>
          )}
        </div>
        <div className="sx-entry-side">
          <span className="sx-num sx-entry-progress">
            {done}/{entry.sets.length}
          </span>
          <button type="button" className="sx-entry-remove" aria-label="Remove exercise" onClick={handleRemove}>
            &times;
          </button>
        </div>
      </div>
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
