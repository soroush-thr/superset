import React, { useEffect, useMemo, useState } from 'react'
import exercises from '../data/exercises.json'
import { MAJORS, SUBGROUP_BY_ID, muscleSummary } from '../lib/taxonomy.js'
import { IMG_BASE } from '../lib/constants.js'
import { useDebounced } from '../lib/hooks.js'
import { useStore } from '../App.jsx'
import Chip from './ui/Chip.jsx'
import Segmented from './ui/Segmented.jsx'
import VirtualList from './ui/VirtualList.jsx'
import ExerciseDetail from './ExerciseDetail.jsx'

const LEVELS = ['beginner', 'intermediate', 'expert']
const MECHANICS = ['compound', 'isolation', 'unspecified']
const FORCES = ['push', 'pull', 'static', 'unspecified']
const ROW_HEIGHT = 68

// "all" isn't a stored profile in settings.equipmentProfiles (only "home"
// and "gym" are) -- it means no equipment restriction at all, so its chip
// set is every equipment value actually present in the data.
const ALL_EQUIPMENT = [...new Set(exercises.map((e) => e.equipment))].sort()

function equipmentOptionsFor(equipmentProfiles, activeProfile) {
  return activeProfile === 'all' ? ALL_EQUIPMENT : equipmentProfiles[activeProfile]
}
const LIST_HEIGHT = 520

function toggle(set, value) {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

function label(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** Which majors this exercise touches at all (weight > 0 in `sub`). */
function exerciseMajors(exercise) {
  const majors = new Set()
  for (const subgroupId of Object.keys(exercise.sub || {})) {
    const major = SUBGROUP_BY_ID[subgroupId]?.major
    if (major) majors.add(major)
  }
  return majors
}

export default function Library() {
  const { state, dispatch } = useStore()
  const { equipmentProfiles, activeProfile } = state.settings

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 150)
  const [selectedMajors, setSelectedMajors] = useState(() => new Set())
  const [selectedLevels, setSelectedLevels] = useState(() => new Set())
  const [selectedMechanics, setSelectedMechanics] = useState(() => new Set())
  const [selectedForces, setSelectedForces] = useState(() => new Set())
  const [selectedEquipment, setSelectedEquipment] = useState(
    () => new Set(equipmentOptionsFor(equipmentProfiles, activeProfile)),
  )
  const [openExercise, setOpenExercise] = useState(null)

  // Equipment chip set is pre-filtered by the active profile (section 9.1).
  // Switching profiles must not clear the other filter categories, so this
  // effect only re-derives the equipment selection.
  useEffect(() => {
    setSelectedEquipment(new Set(equipmentOptionsFor(equipmentProfiles, activeProfile)))
  }, [activeProfile, equipmentProfiles])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return exercises.filter((ex) => {
      if (q) {
        const nameMatch = ex.name.toLowerCase().includes(q)
        const muscleMatch = ex.primary.some((m) => m.toLowerCase().includes(q))
        if (!nameMatch && !muscleMatch) return false
      }
      if (selectedMajors.size > 0) {
        const majors = exerciseMajors(ex)
        if (![...selectedMajors].some((m) => majors.has(m))) return false
      }
      if (!selectedEquipment.has(ex.equipment)) return false
      if (selectedLevels.size > 0 && !selectedLevels.has(ex.level)) return false
      if (selectedMechanics.size > 0) {
        const m = ex.mechanic ?? 'unspecified'
        if (!selectedMechanics.has(m)) return false
      }
      if (selectedForces.size > 0) {
        const f = ex.force ?? 'unspecified'
        if (!selectedForces.has(f)) return false
      }
      return true
    })
  }, [
    debouncedSearch,
    selectedMajors,
    selectedEquipment,
    selectedLevels,
    selectedMechanics,
    selectedForces,
  ])

  const activeRoutine = state.routines.find((r) => r.id === state.activeRoutineId)

  function addToDay(exerciseId, dayId) {
    if (!activeRoutine || !dayId) return
    dispatch({ type: 'ADD_SLOT', routineId: activeRoutine.id, dayId, exerciseId })
  }

  return (
    <div>
      <span className="sx-eyebrow">Library</span>
      <h2>876 exercises</h2>

      <div className="sx-library-controls">
        <input
          className="sx-input sx-search"
          type="search"
          placeholder="Search by name or muscle..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search exercises"
        />

        <Segmented
          value={activeProfile}
          onChange={(v) => dispatch({ type: 'UPDATE_SETTINGS', patch: { activeProfile: v } })}
          options={[
            { value: 'home', label: 'Home' },
            { value: 'gym', label: 'Gym' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>

      <FilterRow title="Muscle group">
        {MAJORS.map((m) => (
          <Chip
            key={m.id}
            label={m.name}
            active={selectedMajors.has(m.id)}
            onClick={() => setSelectedMajors((s) => toggle(s, m.id))}
          />
        ))}
      </FilterRow>

      <FilterRow title="Equipment">
        {equipmentOptionsFor(equipmentProfiles, activeProfile).map((eq) => (
          <Chip
            key={eq}
            label={label(eq)}
            active={selectedEquipment.has(eq)}
            onClick={() => setSelectedEquipment((s) => toggle(s, eq))}
          />
        ))}
      </FilterRow>

      <FilterRow title="Level">
        {LEVELS.map((lvl) => (
          <Chip
            key={lvl}
            label={label(lvl)}
            active={selectedLevels.has(lvl)}
            onClick={() => setSelectedLevels((s) => toggle(s, lvl))}
          />
        ))}
      </FilterRow>

      <FilterRow title="Mechanic">
        {MECHANICS.map((m) => (
          <Chip
            key={m}
            label={label(m)}
            active={selectedMechanics.has(m)}
            onClick={() => setSelectedMechanics((s) => toggle(s, m))}
          />
        ))}
      </FilterRow>

      <FilterRow title="Force">
        {FORCES.map((f) => (
          <Chip
            key={f}
            label={label(f)}
            active={selectedForces.has(f)}
            onClick={() => setSelectedForces((s) => toggle(s, f))}
          />
        ))}
      </FilterRow>

      <p className="sx-eyebrow sx-result-count">
        <span className="sx-num">{filtered.length}</span> of{' '}
        <span className="sx-num">{exercises.length}</span>
      </p>

      {filtered.length === 0 ? (
        <p className="sx-empty-state">
          No exercises match. Widen the equipment profile or clear a filter.
        </p>
      ) : (
        <VirtualList
          items={filtered}
          rowHeight={ROW_HEIGHT}
          height={LIST_HEIGHT}
          renderRow={(exercise) => (
            <ExerciseRow
              exercise={exercise}
              onOpen={() => setOpenExercise(exercise)}
              activeRoutine={activeRoutine}
              onAddToDay={(dayId) => addToDay(exercise.id, dayId)}
            />
          )}
        />
      )}

      <ExerciseDetail
        exercise={openExercise}
        open={!!openExercise}
        onClose={() => setOpenExercise(null)}
      />
    </div>
  )
}

function FilterRow({ title, children }) {
  return (
    <div className="sx-filter-row">
      <span className="sx-eyebrow sx-filter-row-title">{title}</span>
      <div className="sx-chip-row">{children}</div>
    </div>
  )
}

function ExerciseRow({ exercise, onOpen, activeRoutine, onAddToDay }) {
  const thumb = exercise.images[0] ? `${IMG_BASE}${exercise.images[0]}` : null
  const [imgFailed, setImgFailed] = useState(false)

  return (
    <div className="sx-exercise-row">
      <button type="button" className="sx-exercise-row-main" onClick={onOpen}>
        <div className="sx-exercise-thumb">
          {thumb && !imgFailed ? (
            <img
              src={thumb}
              alt=""
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="sx-exercise-thumb-placeholder" aria-hidden="true" />
          )}
        </div>
        <div className="sx-exercise-row-info">
          <span className="sx-exercise-name">{exercise.name}</span>
          <span className="sx-exercise-row-chips">
            <span className="sx-chip sx-chip-static">{label(exercise.equipment)}</span>
            <span className="sx-chip sx-chip-static">{label(exercise.level)}</span>
            <span className="sx-exercise-muscle-summary">{muscleSummary(exercise.sub)}</span>
          </span>
        </div>
      </button>

      <select
        className="sx-input sx-add-to-day"
        value=""
        disabled={!activeRoutine || activeRoutine.days.length === 0}
        title={
          activeRoutine ? undefined : 'Create a routine in the Routine tab first'
        }
        onChange={(e) => {
          if (e.target.value) onAddToDay(e.target.value)
          e.target.value = ''
        }}
      >
        <option value="">Add to...</option>
        {activeRoutine?.days.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </div>
  )
}
