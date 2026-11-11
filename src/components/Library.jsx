import React, { useEffect, useMemo, useState } from 'react'
import { MAJORS, SUBGROUP_BY_ID, muscleSummary } from '../lib/taxonomy.js'
import { IMG_BASE } from '../lib/constants.js'
import { useDebounced } from '../lib/hooks.js'
import { equipmentOptionsFor, allEquipment } from '../lib/equipment.js'
import { useStore, useExercises } from '../App.jsx'
import Chip from './ui/Chip.jsx'
import Drawer from './ui/Drawer.jsx'
import Segmented from './ui/Segmented.jsx'
import VirtualList from './ui/VirtualList.jsx'
import ExerciseDetail from './ExerciseDetail.jsx'
import CustomExerciseEditor from './CustomExerciseEditor.jsx'

const LEVELS = ['beginner', 'intermediate', 'expert']
const MECHANICS = ['compound', 'isolation', 'unspecified']
const FORCES = ['push', 'pull', 'static', 'unspecified']
const ROW_HEIGHT = 68

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
  const { list: exercises } = useExercises()
  const { equipmentProfiles, activeProfile } = state.settings
  const equipmentList = useMemo(() => allEquipment(state.customExercises), [state.customExercises])

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 150)
  const [selectedMajors, setSelectedMajors] = useState(() => new Set())
  const [selectedLevels, setSelectedLevels] = useState(() => new Set())
  const [selectedMechanics, setSelectedMechanics] = useState(() => new Set())
  const [selectedForces, setSelectedForces] = useState(() => new Set())
  const [customOnly, setCustomOnly] = useState(false)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const favoritesSet = useMemo(() => new Set(state.favorites), [state.favorites])
  // Only equipment the user explicitly picked. Empty means "whatever the
  // profile allows" -- so chips don't all look switched on by default.
  const [chosenEquipment, setChosenEquipment] = useState(() => new Set())
  const [dayPickerFor, setDayPickerFor] = useState(null)
  const [openExercise, setOpenExercise] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)
  // Collapsed everywhere: the toggle shows a count, and the list comes first.
  const [filtersOpen, setFiltersOpen] = useState(false)

  const profileEquipment = useMemo(
    () => equipmentOptionsFor(equipmentProfiles, activeProfile, equipmentList),
    [equipmentProfiles, activeProfile, equipmentList],
  )
  const profileEquipmentSet = useMemo(() => new Set(profileEquipment), [profileEquipment])

  // Switching profiles must not clear the other filter categories, so this
  // only drops picks the new profile can't offer.
  useEffect(() => {
    setChosenEquipment((prev) => {
      const next = new Set([...prev].filter((eq) => profileEquipmentSet.has(eq)))
      return next.size === prev.size ? prev : next
    })
  }, [profileEquipmentSet])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return exercises.filter((ex) => {
      if (customOnly && !ex.custom) return false
      if (favoritesOnly && !favoritesSet.has(ex.id)) return false
      if (q) {
        const nameMatch = ex.name.toLowerCase().includes(q)
        const muscleMatch = ex.primary.some((m) => m.toLowerCase().includes(q))
        if (!nameMatch && !muscleMatch) return false
      }
      if (selectedMajors.size > 0) {
        const majors = exerciseMajors(ex)
        if (![...selectedMajors].some((m) => majors.has(m))) return false
      }
      if (!profileEquipmentSet.has(ex.equipment)) return false
      if (chosenEquipment.size > 0 && !chosenEquipment.has(ex.equipment)) return false
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
    exercises,
    customOnly,
    favoritesOnly,
    favoritesSet,
    debouncedSearch,
    selectedMajors,
    profileEquipmentSet,
    chosenEquipment,
    selectedLevels,
    selectedMechanics,
    selectedForces,
  ])

  const activeFilterCount =
    selectedMajors.size +
    chosenEquipment.size +
    selectedLevels.size +
    selectedMechanics.size +
    selectedForces.size +
    (customOnly ? 1 : 0) +
    (favoritesOnly ? 1 : 0)

  const activeRoutine = state.routines.find((r) => r.id === state.activeRoutineId)

  function addToDay(exerciseId, dayId) {
    if (!activeRoutine || !dayId) return
    dispatch({ type: 'ADD_SLOT', routineId: activeRoutine.id, dayId, exerciseId })
  }

  // The open filter panel lives in the sticky toolbar; fold it away once the
  // user scrolls on into the list so it never hogs the screen.
  useEffect(() => {
    if (!filtersOpen) return undefined
    const start = window.scrollY
    const onScroll = () => {
      if (Math.abs(window.scrollY - start) > 160) setFiltersOpen(false)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [filtersOpen])

  return (
    <div>
      <span className="sx-eyebrow">Library</span>
      <h2>876 exercises</h2>

      <div className="sx-library-toolbar">
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

        <button type="button" onClick={() => setEditorOpen(true)}>
          New exercise
        </button>
      </div>

      <button
        type="button"
        className="sx-filters-toggle"
        aria-expanded={filtersOpen}
        onClick={() => setFiltersOpen((v) => !v)}
      >
        Filters{activeFilterCount > 0 ? ` \u00b7 ${activeFilterCount}` : ''} {filtersOpen ? '\u25b4' : '\u25be'}
      </button>

      {filtersOpen && (
        <div className="sx-filter-panel">
          <FilterRow title="Muscle group">
            {MAJORS.map((m) => (
              <Chip
                key={m.id}
                label={m.name}
                active={selectedMajors.has(m.id)}
                onClick={() => setSelectedMajors((s) => toggle(s, m.id))}
              />
            ))}
            <Chip label="Custom only" active={customOnly} onClick={() => setCustomOnly((c) => !c)} />
            <Chip label="Favorites" active={favoritesOnly} onClick={() => setFavoritesOnly((f) => !f)} />
          </FilterRow>

          <FilterRow title="Equipment">
            {profileEquipment.map((eq) => (
              <Chip
                key={eq}
                label={label(eq)}
                active={chosenEquipment.has(eq)}
                onClick={() => setChosenEquipment((s) => toggle(s, eq))}
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
        </div>
      )}

      <p className="sx-eyebrow sx-result-count">
        <span className="sx-num">{filtered.length}</span> of{' '}
        <span className="sx-num">{exercises.length}</span>
      </p>
      </div>

      {filtered.length === 0 ? (
        <p className="sx-empty-state">
          No exercises match. Widen the equipment profile or clear a filter.
        </p>
      ) : (
        <VirtualList
          items={filtered}
          rowHeight={ROW_HEIGHT}
          renderRow={(exercise) => (
            <ExerciseRow
              exercise={exercise}
              onOpen={() => setOpenExercise(exercise)}
              activeRoutine={activeRoutine}
              onAddToDay={() => setDayPickerFor(exercise)}
              isFavorite={favoritesSet.has(exercise.id)}
              onToggleFavorite={() => dispatch({ type: 'TOGGLE_FAVORITE', exerciseId: exercise.id })}
            />
          )}
        />
      )}

      <ExerciseDetail
        exercise={openExercise}
        open={!!openExercise}
        onClose={() => setOpenExercise(null)}
        onSelectExercise={setOpenExercise}
      />
      <Drawer
        open={!!dayPickerFor}
        onClose={() => setDayPickerFor(null)}
        title={dayPickerFor ? `Add ${dayPickerFor.name} to...` : ''}
      >
        <div className="sx-day-picker">
          {activeRoutine?.days.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                addToDay(dayPickerFor.id, d.id)
                setDayPickerFor(null)
              }}
            >
              {d.name}
            </button>
          ))}
        </div>
      </Drawer>
      <CustomExerciseEditor open={editorOpen} onClose={() => setEditorOpen(false)} />
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

function ExerciseRow({ exercise, onOpen, activeRoutine, onAddToDay, isFavorite, onToggleFavorite }) {
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
            <div className="sx-exercise-thumb-placeholder" aria-hidden="true">
              {exercise.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="sx-exercise-row-info">
          <span className="sx-exercise-name">{exercise.name}</span>
          <span className="sx-exercise-row-chips">
            {exercise.custom && <span className="sx-chip sx-chip-static">Custom</span>}
            <span className="sx-chip sx-chip-static">{label(exercise.equipment)}</span>
            <span className="sx-chip sx-chip-static">{label(exercise.level)}</span>
            <span className="sx-exercise-muscle-summary">{muscleSummary(exercise.sub)}</span>
          </span>
        </div>
      </button>

      <button
        type="button"
        className="sx-favorite-star"
        aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        aria-pressed={isFavorite}
        onClick={onToggleFavorite}
      >
        {isFavorite ? '★' : '☆'}
      </button>

      <button
        type="button"
        className="sx-add-to-day"
        aria-label={`Add ${exercise.name} to a day`}
        disabled={!activeRoutine || activeRoutine.days.length === 0}
        title={activeRoutine ? 'Add to a day' : 'Create a routine in the Routine tab first'}
        onClick={onAddToDay}
      >
        +
      </button>
    </div>
  )
}
