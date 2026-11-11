import React, { useState } from 'react'
import { useStore } from '../App.jsx'
import Segmented from './ui/Segmented.jsx'
import ActiveSession from './train/ActiveSession.jsx'
import SessionSummary from './train/SessionSummary.jsx'
import SessionHistory from './train/SessionHistory.jsx'
import Progress from './train/Progress.jsx'
import Generate from './train/Generate.jsx'

const TABS = [
  { value: 'active', label: 'Active' },
  { value: 'history', label: 'History' },
  { value: 'progress', label: 'Progress' },
  { value: 'generate', label: 'Generate' },
]

/** Logged workouts: the active session, past sessions, and progression
 *  charts. Sub-view state is local, not persisted -- like every other
 *  screen, it resets on tab switch. */
export default function Train() {
  const { state } = useStore()
  const [tab, setTab] = useState('active')
  // The session that was just finished, shown as a summary card in place of
  // "No session in progress" until dismissed or a new session starts.
  const [summaryId, setSummaryId] = useState(null)
  const summarySession =
    summaryId && !state.activeSessionId ? state.sessions.find((s) => s.id === summaryId && s.endedAt) : null

  return (
    <div>
      <span className="sx-eyebrow">Train</span>
      <div className="sx-train-tabs">
        <Segmented value={tab} onChange={setTab} options={TABS} />
        {state.activeSessionId && (
          <span className="sx-train-active-badge" role="status">
            Session in progress
          </span>
        )}
      </div>

      {tab === 'active' &&
        (summarySession ? (
          <SessionSummary session={summarySession} onDone={() => setSummaryId(null)} />
        ) : (
          <ActiveSession onFinished={setSummaryId} />
        ))}
      {tab === 'history' && <SessionHistory />}
      {tab === 'progress' && <Progress />}
      {tab === 'generate' && <Generate onStarted={() => setTab('active')} />}
    </div>
  )
}
