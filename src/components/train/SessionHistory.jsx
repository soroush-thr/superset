import React, { useState } from 'react'
import { useStore, useExercises } from '../../App.jsx'
import { formatWeight } from '../../lib/units.js'
import { DEFAULT_BODY_KG, latestBodyKg, sessionKcal } from '../../lib/calories.js'
import Drawer from '../ui/Drawer.jsx'

function formatDuration(startedAt, endedAt) {
  const mins = Math.max(0, Math.round((new Date(endedAt) - new Date(startedAt)) / 60000))
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

/** A list of finished sessions, newest first; tap a row for full per-set detail. */
export default function SessionHistory() {
  const { state } = useStore()
  const { byId: exercisesById } = useExercises()
  const bodyKg = latestBodyKg(state.bodyLog) ?? DEFAULT_BODY_KG
  const [openSessionId, setOpenSessionId] = useState(null)

  const finished = [...state.sessions]
    .filter((s) => s.endedAt)
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))

  const openSession = finished.find((s) => s.id === openSessionId) ?? null

  if (finished.length === 0) {
    return <p className="sx-empty-state">No finished sessions yet.</p>
  }

  return (
    <div className="sx-session-history">
      {finished.map((session) => {
        const totalSets = session.entries.reduce((sum, e) => sum + e.sets.filter((s) => s.done).length, 0)
        const kcal = sessionKcal(session, exercisesById, bodyKg)
        return (
          <button
            type="button"
            key={session.id}
            className="sx-session-history-row"
            onClick={() => setOpenSessionId(session.id)}
          >
            <div className="sx-session-history-main">
              <span className="sx-entry-name">{session.dayName || 'Ad-hoc session'}</span>
              <span className="sx-eyebrow">
                {new Date(session.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                {' · '}
                {formatDuration(session.startedAt, session.endedAt)}
              </span>
            </div>
            <span className="sx-num">
              {totalSets} sets{kcal != null ? ` · ~${kcal} kcal` : ''}
            </span>
          </button>
        )
      })}

      <SessionDetail session={openSession} open={!!openSession} onClose={() => setOpenSessionId(null)} />
    </div>
  )
}

function SessionDetail({ session, open, onClose }) {
  const { state } = useStore()
  const { byId: exercisesById } = useExercises()
  const unit = state.settings.unit ?? 'kg'
  const loggedKg = latestBodyKg(state.bodyLog)

  if (!session) {
    return <Drawer open={open} onClose={onClose} title="Session" />
  }

  return (
    <Drawer open={open} onClose={onClose} title={session.dayName || 'Ad-hoc session'}>
      <span className="sx-eyebrow">
        {new Date(session.startedAt).toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        })}
        {' · '}
        {formatDuration(session.startedAt, session.endedAt)}
      </span>
      {(() => {
        const kcal = sessionKcal(session, exercisesById, loggedKg ?? DEFAULT_BODY_KG)
        return kcal == null ? null : (
          <p className="sx-helper-text">
            About {kcal} kcal burned (rough estimate, ±25%; {loggedKg ? 'from your latest logged body weight' : `assumes ${DEFAULT_BODY_KG} kg, log yours in Progress`}).
          </p>
        )
      })()}
      {session.note && <p className="sx-helper-text">{session.note}</p>}

      {session.entries.map((entry) => {
        const doneSets = entry.sets.filter((s) => s.done)
        return (
          <div key={entry.id} className="sx-session-detail-entry">
            <span className="sx-entry-name">{exercisesById[entry.exerciseId]?.name ?? entry.exerciseId}</span>
            {doneSets.length === 0 ? (
              <p className="sx-empty-state">No sets logged.</p>
            ) : (
              <ul className="sx-session-detail-sets">
                {doneSets.map((set, i) => (
                  <li key={set.id}>
                    <span>Set {i + 1}</span>
                    <span className="sx-num">
                      {formatWeight(set.weightKg, unit)} &times; {set.reps ?? '-'}
                      {set.rpe != null ? ` @ RPE ${set.rpe}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </Drawer>
  )
}
