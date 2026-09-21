import React, { useState } from 'react'
import { useStore } from '../App.jsx'
import Segmented from './ui/Segmented.jsx'
import ActiveSession from './train/ActiveSession.jsx'
import SessionHistory from './train/SessionHistory.jsx'
import Progress from './train/Progress.jsx'

const TABS = [
  { value: 'active', label: 'Active' },
  { value: 'history', label: 'History' },
  { value: 'progress', label: 'Progress' },
]

/** Logged workouts: the active session, past sessions, and progression
 *  charts. Sub-view state is local, not persisted -- like every other
 *  screen, it resets on tab switch. */
export default function Train() {
  const { state } = useStore()
  const [tab, setTab] = useState('active')

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

      {tab === 'active' && <ActiveSession />}
      {tab === 'history' && <SessionHistory />}
      {tab === 'progress' && <Progress />}
    </div>
  )
}
