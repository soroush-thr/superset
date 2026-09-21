import React, { useMemo, useState } from 'react'
import { useStore, useDispatch, useExercises } from '../../App.jsx'
import { est1RM, topSetOf } from '../../lib/sessions.js'
import { toDisplay, fromDisplay, formatWeight } from '../../lib/units.js'
import LineChart from '../ui/LineChart.jsx'

function round1(n) {
  return Math.round(n * 10) / 10
}

function best(history, valueOf) {
  let max = null
  for (const h of history) {
    const v = valueOf(h)
    if (v == null) continue
    if (max == null || v > max) max = v
  }
  return max
}

/** Estimated 1RM and top-set-weight trend for one exercise at a time (plus
 *  its PRs), and a bodyweight trend independent of any exercise. Built from
 *  finished sessions and the bodyweight log only. */
export default function Progress() {
  const { state } = useStore()
  const { byId: exercisesById } = useExercises()
  const unit = state.settings.unit ?? 'kg'

  return (
    <div>
      <ExerciseProgress state={state} exercisesById={exercisesById} unit={unit} />
      <BodyWeightSection state={state} unit={unit} />
    </div>
  )
}

function ExerciseProgress({ state, exercisesById, unit }) {
  const finished = useMemo(
    () => [...state.sessions].filter((s) => s.endedAt).sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt)),
    [state.sessions],
  )

  const loggedExerciseIds = useMemo(() => {
    const ids = new Set()
    for (const session of finished) {
      for (const entry of session.entries) {
        if (entry.sets.some((s) => s.done)) ids.add(entry.exerciseId)
      }
    }
    return [...ids].sort((a, b) => (exercisesById[a]?.name ?? a).localeCompare(exercisesById[b]?.name ?? b))
  }, [finished, exercisesById])

  const [exerciseId, setExerciseId] = useState('')
  const activeId = loggedExerciseIds.includes(exerciseId) ? exerciseId : loggedExerciseIds[0]

  if (loggedExerciseIds.length === 0) {
    return <p className="sx-empty-state">Log a few sessions to see exercise progress here.</p>
  }

  const history = []
  for (const session of finished) {
    const entry = session.entries.find((e) => e.exerciseId === activeId)
    const top = entry && topSetOf(entry)
    if (!top) continue
    history.push({ date: new Date(session.startedAt).getTime(), top })
  }

  const e1rmSeries = {
    label: 'Est. 1RM',
    points: history
      .map((h) => ({ x: h.date, y: est1RM(h.top.weightKg, h.top.reps) }))
      .filter((p) => p.y != null)
      .map((p) => ({ x: p.x, y: round1(toDisplay(p.y, unit)) })),
  }
  const weightSeries = {
    label: 'Top set weight',
    points: history
      .filter((h) => h.top.weightKg != null)
      .map((h) => ({ x: h.date, y: round1(toDisplay(h.top.weightKg, unit)) })),
  }

  const bestE1RM = best(history, (h) => est1RM(h.top.weightKg, h.top.reps))
  const bestWeight = best(history, (h) => h.top.weightKg)

  return (
    <div>
      <label className="sx-field">
        <span className="sx-eyebrow">Exercise</span>
        <select className="sx-input" value={activeId} onChange={(e) => setExerciseId(e.target.value)}>
          {loggedExerciseIds.map((id) => (
            <option key={id} value={id}>
              {exercisesById[id]?.name ?? id}
            </option>
          ))}
        </select>
      </label>

      {history.length < 2 ? (
        <p className="sx-empty-state">Log this exercise a couple more times to see a trend.</p>
      ) : (
        <LineChart series={[e1rmSeries, weightSeries]} yLabel={`Weight (${unit})`} />
      )}

      <div className="sx-pr-list">
        {bestE1RM != null && (
          <div className="sx-pr-item">
            <span className="sx-eyebrow">Best est. 1RM</span>
            <span className="sx-num">
              {round1(toDisplay(bestE1RM, unit))} {unit}
            </span>
          </div>
        )}
        {bestWeight != null && (
          <div className="sx-pr-item">
            <span className="sx-eyebrow">Best set weight</span>
            <span className="sx-num">
              {round1(toDisplay(bestWeight, unit))} {unit}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function BodyWeightSection({ state, unit }) {
  const dispatch = useDispatch()
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [weightText, setWeightText] = useState('')

  const sorted = useMemo(() => [...state.bodyLog].sort((a, b) => a.date.localeCompare(b.date)), [state.bodyLog])

  function handleAdd() {
    const n = parseFloat(weightText)
    if (!Number.isFinite(n) || !date) return
    dispatch({ type: 'ADD_BODY_LOG', date, weightKg: fromDisplay(n, unit) })
    setWeightText('')
  }

  const series = [
    {
      label: 'Bodyweight',
      points: sorted.map((b) => ({ x: new Date(b.date).getTime(), y: round1(toDisplay(b.weightKg, unit)) })),
    },
  ]

  return (
    <div className="sx-bodyweight-section">
      <h3>Bodyweight</h3>
      <div className="sx-bodyweight-form">
        <input
          type="date"
          className="sx-input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date"
        />
        <input
          className="sx-input"
          inputMode="decimal"
          placeholder={unit}
          aria-label={`Weight (${unit})`}
          value={weightText}
          onChange={(e) => setWeightText(e.target.value)}
        />
        <button type="button" className="sx-primary" onClick={handleAdd}>
          Log weight
        </button>
      </div>

      {sorted.length < 2 ? (
        <p className="sx-empty-state">Log your weight a couple more times to see a trend.</p>
      ) : (
        <LineChart series={series} yLabel={`Weight (${unit})`} />
      )}

      {sorted.length > 0 && (
        <ul className="sx-bodyweight-list">
          {[...sorted]
            .reverse()
            .slice(0, 10)
            .map((b) => (
              <li key={b.id}>
                <span>{b.date}</span>
                <span className="sx-num">{formatWeight(b.weightKg, unit)}</span>
                <button
                  type="button"
                  aria-label={`Delete bodyweight entry for ${b.date}`}
                  onClick={() => dispatch({ type: 'DELETE_BODY_LOG', id: b.id })}
                >
                  &times;
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
