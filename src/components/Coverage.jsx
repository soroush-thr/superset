import React, { useMemo, useState } from 'react'
import { useStore, useBodyMapFeed } from '../App.jsx'
import { weeklyVolume, computeStatuses, suggestExercises } from '../lib/coverage.js'
import { targetsWithDefaults } from '../lib/store.js'
import { MAJORS, SUBGROUPS, subgroupName } from '../lib/taxonomy.js'
import { equipmentOptionsFor } from '../lib/equipment.js'
import exercisesData from '../data/exercises.json'
import Segmented from './ui/Segmented.jsx'

const EXERCISES_BY_ID = Object.fromEntries(exercisesData.map((e) => [e.id, e]))

const SORT_OPTIONS = [
  { value: 'major', label: 'Major' },
  { value: 'deficit', label: 'Deficit' },
  { value: 'volume', label: 'Volume' },
]

function exerciseIdsInRoutine(routine) {
  const ids = new Set()
  for (const day of routine.days) {
    for (const slot of day.slots) {
      for (const entry of slot.entries) ids.add(entry.exerciseId)
    }
  }
  return ids
}

/**
 * Section 9.4: the analysis screen for the active routine. The body maps
 * themselves are rendered by the shell's sticky aside (see App.jsx's
 * BodyMapFeedContext) so this only needs to push values, not render SVG.
 */
export default function Coverage() {
  const { state, dispatch } = useStore()
  const routine = state.routines.find((r) => r.id === state.activeRoutineId)
  const targets = useMemo(() => targetsWithDefaults(state), [state.settings.targets])

  const volume = useMemo(() => {
    if (!routine) return {}
    return weeklyVolume(routine, EXERCISES_BY_ID, state.settings.creditMode)
  }, [routine, state.settings.creditMode])

  const statuses = useMemo(() => computeStatuses(volume, targets), [volume, targets])

  const scaleMax = useMemo(() => {
    const ceilings = Object.values(targets).map((t) => t[1])
    return ceilings.length ? Math.max(...ceilings) : 1
  }, [targets])

  useBodyMapFeed(
    useMemo(() => ({ front: volume, back: volume, scaleMax }), [volume, scaleMax]),
  )

  const [sortMode, setSortMode] = useState('major')

  if (!routine) {
    return (
      <div>
        <span className="sx-eyebrow">Coverage</span>
        <h2>Build a routine to see where your volume lands.</h2>
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
      <span className="sx-eyebrow">Coverage</span>
      <h2>{routine.name}</h2>

      <div className="sx-coverage-controls">
        <Segmented value={sortMode} onChange={setSortMode} options={SORT_OPTIONS} />
        <CreditModeToggle state={state} dispatch={dispatch} />
      </div>

      <Ledger sortMode={sortMode} statuses={statuses} targets={targets} />

      <GapPanel
        state={state}
        routine={routine}
        statuses={statuses}
        dispatch={dispatch}
      />
    </div>
  )
}

function CreditModeToggle({ state, dispatch }) {
  return (
    <div className="sx-credit-mode">
      <Segmented
        value={state.settings.creditMode}
        onChange={(v) => dispatch({ type: 'UPDATE_SETTINGS', patch: { creditMode: v } })}
        options={[
          { value: 'peak', label: 'Peak' },
          { value: 'fraction', label: 'Fraction' },
        ]}
      />
      <p className="sx-helper-text">
        {state.settings.creditMode === 'peak'
          ? 'Peak: a compound counts as one full set for its strongest sub-group, partial credit elsewhere.'
          : 'Fraction: every set distributes exactly 1.0 total credit across all sub-groups it touches.'}
      </p>
    </div>
  )
}

function statusDotColor(status) {
  if (status === 'below') return 'var(--under)'
  if (status === 'above') return 'var(--over)'
  return 'var(--in)'
}

function sortedSubgroupIds(sortMode, statuses) {
  const ids = Object.keys(statuses)
  if (sortMode === 'deficit') {
    return ids.sort((a, b) => statuses[b].deficit - statuses[a].deficit)
  }
  if (sortMode === 'volume') {
    return ids.sort((a, b) => statuses[b].value - statuses[a].value)
  }
  return ids // already in taxonomy (major) order via Object.keys(targets)
}

function Ledger({ sortMode, statuses, targets }) {
  if (sortMode !== 'major') {
    const ids = sortedSubgroupIds(sortMode, statuses)
    return (
      <div className="sx-ledger">
        {ids.map((id) => (
          <LedgerRow key={id} subgroupId={id} status={statuses[id]} target={targets[id]} />
        ))}
      </div>
    )
  }

  return (
    <div className="sx-ledger">
      {MAJORS.map((major) => {
        const subgroups = SUBGROUPS.filter((s) => s.major === major.id && statuses[s.id])
        if (subgroups.length === 0) return null
        return (
          <div key={major.id} className="sx-ledger-major">
            <span className="sx-eyebrow">{major.name}</span>
            {subgroups.map((s) => (
              <LedgerRow
                key={s.id}
                subgroupId={s.id}
                status={statuses[s.id]}
                target={targets[s.id]}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function LedgerRow({ subgroupId, status, target }) {
  const [min, max] = target
  const barScaleMax = Math.max(status.value, max) * 1.15 || 1
  const valuePct = Math.min(100, (status.value / barScaleMax) * 100)
  const minPct = (min / barScaleMax) * 100
  const maxPct = (max / barScaleMax) * 100

  return (
    <div className="sx-ledger-row">
      <span
        className="sx-status-dot"
        style={{ background: statusDotColor(status.status) }}
        aria-hidden="true"
      />
      <span className="sx-ledger-name">{subgroupName(subgroupId)}</span>
      <div className="sx-coverage-bar-track">
        <div
          className="sx-coverage-bar-fill"
          style={{ width: `${valuePct}%`, background: statusDotColor(status.status) }}
        />
        <div
          className="sx-coverage-bar-bracket"
          style={{ left: `${minPct}%`, width: `${Math.max(0, maxPct - minPct)}%` }}
        />
      </div>
      <span className="sx-num sx-ledger-value">{status.value.toFixed(1)}</span>
    </div>
  )
}

function GapPanel({ state, routine, statuses, dispatch }) {
  const [expanded, setExpanded] = useState(() => new Set())

  const belowIds = Object.entries(statuses)
    .filter(([, s]) => s.status === 'below')
    .sort((a, b) => b[1].deficit - a[1].deficit)
    .map(([id]) => id)

  const excludeIds = useMemo(() => exerciseIdsInRoutine(routine), [routine])
  const equipmentProfile = equipmentOptionsFor(
    state.settings.equipmentProfiles,
    state.settings.activeProfile,
  )

  const suggestions = useMemo(
    () =>
      suggestExercises({
        statuses,
        exercises: exercisesData,
        equipmentProfile,
        maxLevel: state.settings.maxLevel,
        excludeIds,
      }),
    [statuses, equipmentProfile, state.settings.maxLevel, excludeIds],
  )

  function toggle(id) {
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function addToDay(exerciseId, dayId) {
    if (!dayId) return
    dispatch({ type: 'ADD_SLOT', routineId: routine.id, dayId, exerciseId })
  }

  if (belowIds.length === 0) {
    return (
      <div className="sx-gap-panel">
        <span className="sx-eyebrow">Gaps</span>
        <p className="sx-empty-state">Nothing under target. Every sub-group is in range or above.</p>
      </div>
    )
  }

  return (
    <div className="sx-gap-panel">
      <span className="sx-eyebrow">Gaps</span>
      {belowIds.map((id) => (
        <div key={id} className="sx-gap-item">
          <button type="button" className="sx-gap-header" onClick={() => toggle(id)}>
            <span>{subgroupName(id)}</span>
            <span className="sx-num">-{statuses[id].deficit.toFixed(1)} sets</span>
          </button>
          {expanded.has(id) && (
            <ul className="sx-gap-suggestions">
              {(suggestions[id] ?? []).map(({ exercise }) => (
                <li key={exercise.id}>
                  <span>{exercise.name}</span>
                  <select
                    className="sx-input"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) addToDay(exercise.id, e.target.value)
                      e.target.value = ''
                    }}
                  >
                    <option value="">Add to...</option>
                    {routine.days.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
              {(suggestions[id] ?? []).length === 0 && (
                <li className="sx-empty-state">No candidates match the active equipment profile.</li>
              )}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
