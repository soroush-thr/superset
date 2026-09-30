import React, { useMemo, useState } from 'react'
import { useStore, useBodyMapFeed, useExercises } from '../../App.jsx'
import { targetsWithDefaults } from '../../lib/store.js'
import { volumeForEntries } from '../../lib/coverage.js'
import { DEFAULT_BODY_KG, latestBodyKg, plannedKcal } from '../../lib/calories.js'
import { allEquipment } from '../../lib/equipment.js'
import { MAJORS, SUBGROUPS, muscleSummary } from '../../lib/taxonomy.js'
import {
  GENERATOR_DEFAULTS,
  buildContext,
  generateWorkout,
  estimateSeconds,
  generatorSettingsWithDefaults,
  swapExercise,
} from '../../lib/generator.js'
import Chip from '../ui/Chip.jsx'
import Segmented from '../ui/Segmented.jsx'
import NumberField from '../ui/NumberField.jsx'

const TYPE_OPTIONS = [
  { value: 'full', label: 'Full body' },
  { value: 'targeted', label: 'Targeted' },
]
const LOCATION_OPTIONS = [
  { value: 'home', label: 'Home' },
  { value: 'gym', label: 'Gym' },
]
const LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Mid' },
  { value: 'advanced', label: 'Advanced' },
]
const GOAL_OPTIONS = [
  { value: 'strength', label: 'Strength' },
  { value: 'hypertrophy', label: 'Hypertrophy' },
  { value: 'endurance', label: 'Endurance' },
]
// Full body starts with everything except neck, which is rarely wanted.
const FULL_BODY_MAJORS = GENERATOR_DEFAULTS.majors

const randomSeed = () => Math.floor(Math.random() * 2 ** 32)
const toggle = (list, item) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item])

/** Random workout generator: configure, preview (with per-exercise swap),
 *  then start it as a session or save it as a routine day. */
export default function Generate({ onStarted }) {
  const { state, dispatch } = useStore()
  const { list: exercises, byId } = useExercises()

  const [form, setForm] = useState(() => {
    const f = generatorSettingsWithDefaults(state.settings.generator, state.settings)
    return { ...f, equipment: f.equipment ?? state.settings.equipmentProfiles[f.location] ?? [] }
  })
  const [workout, setWorkout] = useState(null)
  const [fineTune, setFineTune] = useState(false)
  const [saveTarget, setSaveTarget] = useState('')
  const [saved, setSaved] = useState(false)

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const ctx = useMemo(
    () =>
      buildContext({
        exercises,
        targets: targetsWithDefaults(state),
        sessions: state.sessions,
        favorites: state.favorites,
        creditMode: state.settings.creditMode,
      }),
    [exercises, state.settings.targets, state.settings.creditMode, state.sessions, state.favorites],
  )

  const volume = useMemo(() => {
    if (!workout) return {}
    return volumeForEntries(
      workout.items.map((it) => ({ exerciseId: it.exerciseId, sets: it.sets })),
      byId,
      state.settings.creditMode,
    )
  }, [workout, byId, state.settings.creditMode])

  useBodyMapFeed(useMemo(() => ({ front: volume, back: volume }), [volume]))

  function setLocation(location) {
    set({
      location,
      equipment: state.settings.equipmentProfiles[location] ?? [],
      hasBar: location === 'gym',
      hasBench: location === 'gym',
    })
  }

  function setType(type) {
    set({ type, majors: type === 'full' ? FULL_BODY_MAJORS : [], excludeSubs: [] })
  }

  function generate() {
    setSaved(false)
    setWorkout(generateWorkout(form, ctx, randomSeed()))
    dispatch({ type: 'UPDATE_SETTINGS', patch: { generator: form } })
  }

  const equipmentOptions = allEquipment(state.customExercises)
  const majorsSelected = form.majors.length > 0
  const routine = state.routines.find((r) => r.id === saveTarget)

  return (
    <div className="sx-generate">
      <div className="sx-gen-form">
        <div className="sx-field">
          <span className="sx-eyebrow">Workout type</span>
          <Segmented value={form.type} onChange={setType} options={TYPE_OPTIONS} />
        </div>

        <div className="sx-field">
          <span className="sx-eyebrow">Muscles to cover</span>
          <div className="sx-chip-row">
            {MAJORS.map((m) => (
              <Chip
                key={m.id}
                label={m.name}
                active={form.majors.includes(m.id)}
                onClick={() => set({ majors: toggle(form.majors, m.id) })}
              />
            ))}
          </div>
          {!majorsSelected && <p className="sx-helper-text">Pick at least one muscle group.</p>}
          {majorsSelected && (
            <button type="button" className="sx-link-button" onClick={() => setFineTune((v) => !v)}>
              {fineTune ? 'Hide fine-tuning' : 'Fine-tune sub-groups'}
            </button>
          )}
          {fineTune &&
            MAJORS.filter((m) => form.majors.includes(m.id)).map((m) => (
              <div key={m.id} className="sx-gen-subgroups">
                <span className="sx-helper-text">{m.name}</span>
                <div className="sx-chip-row">
                  {SUBGROUPS.filter((s) => s.major === m.id).map((s) => (
                    <Chip
                      key={s.id}
                      label={s.name}
                      active={!form.excludeSubs.includes(s.id)}
                      onClick={() => set({ excludeSubs: toggle(form.excludeSubs, s.id) })}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>

        <div className="sx-field">
          <span className="sx-eyebrow">Where</span>
          <Segmented value={form.location} onChange={setLocation} options={LOCATION_OPTIONS} />
        </div>

        <div className="sx-field">
          <span className="sx-eyebrow">Equipment available</span>
          <div className="sx-chip-row">
            {equipmentOptions.map((eq) => (
              <Chip
                key={eq}
                label={eq}
                active={form.equipment.includes(eq)}
                onClick={() => set({ equipment: toggle(form.equipment, eq) })}
              />
            ))}
            <Chip label="pull-up bar" active={form.hasBar} onClick={() => set({ hasBar: !form.hasBar })} />
            <Chip label="bench" active={form.hasBench} onClick={() => set({ hasBench: !form.hasBench })} />
          </div>
        </div>

        <div className="sx-field">
          <span className="sx-eyebrow">Level</span>
          <Segmented value={form.level} onChange={(level) => set({ level })} options={LEVEL_OPTIONS} />
        </div>

        <div className="sx-field">
          <span className="sx-eyebrow">Goal</span>
          <Segmented value={form.goal} onChange={(goal) => set({ goal })} options={GOAL_OPTIONS} />
        </div>

        <div className="sx-field sx-gen-limits">
          <div>
            <Chip
              label="Time limit"
              active={form.durationMin != null}
              onClick={() => set({ durationMin: form.durationMin == null ? 45 : null })}
            />
            {form.durationMin != null && (
              <NumberField
                label="Minutes"
                value={form.durationMin}
                onChange={(v) => set({ durationMin: v })}
                min={10}
                max={120}
                step={5}
              />
            )}
          </div>
          <div>
            <Chip
              label="Number of moves"
              active={form.moves != null}
              onClick={() => set({ moves: form.moves == null ? 6 : null })}
            />
            {form.moves != null && (
              <NumberField
                label="Moves"
                value={form.moves}
                onChange={(v) => set({ moves: v })}
                min={1}
                max={14}
              />
            )}
          </div>
          <p className="sx-helper-text">
            {form.durationMin != null && form.moves != null
              ? 'Both set: you get exactly this many moves; sets and rest are fitted to the time.'
              : form.durationMin != null
                ? 'Time only: the number of moves is worked out from it.'
                : form.moves != null
                  ? 'Moves only: standard sets, and the estimated time is shown.'
                  : 'Neither set: defaults to about 45 minutes.'}
          </p>
        </div>

        <div className="sx-field">
          <span className="sx-eyebrow">Options</span>
          <div className="sx-chip-row">
            <Chip
              label="Favour undertrained muscles"
              active={form.favourUndertrained}
              onClick={() => set({ favourUndertrained: !form.favourUndertrained })}
            />
            <Chip label="Warm-up & cooldown" active={form.warmup} onClick={() => set({ warmup: !form.warmup })} />
            <Chip label="Supersets" active={form.supersets} onClick={() => set({ supersets: !form.supersets })} />
          </div>
        </div>

        <button type="button" className="sx-primary" disabled={!majorsSelected} onClick={generate}>
          {workout ? 'Generate a new workout' : 'Generate workout'}
        </button>
      </div>

      {workout && (
        <Preview
          workout={workout}
          volume={volume}
          bodyKg={latestBodyKg(state.bodyLog)}
          byId={byId}
          ctx={ctx}
          onSwap={(i) => {
            setSaved(false)
            setWorkout((w) => swapExercise(w, i, ctx, randomSeed()))
          }}
          onReroll={generate}
          canStart={!state.activeSessionId}
          onStart={() => {
            dispatch({ type: 'START_GENERATED_SESSION', workout })
            onStarted?.()
          }}
          routines={state.routines}
          saveTarget={saveTarget}
          setSaveTarget={setSaveTarget}
          saved={saved}
          onSave={() => {
            dispatch({ type: 'SAVE_GENERATED_DAY', workout, routineId: routine ? routine.id : null })
            setSaved(true)
          }}
        />
      )}
    </div>
  )
}

function Preview({
  workout,
  volume,
  bodyKg,
  byId,
  onSwap,
  onReroll,
  canStart,
  onStart,
  routines,
  saveTarget,
  setSaveTarget,
  saved,
  onSave,
}) {
  const { params } = workout
  const limit = params.durationMin ?? (params.moves ? null : 45)
  const kcal = plannedKcal(workout.items, estimateSeconds(workout.items), bodyKg ?? DEFAULT_BODY_KG, {
    warmup: params.warmup,
  })

  if (workout.items.length === 0) {
    return (
      <div className="sx-gen-preview">
        {workout.warnings.map((w) => (
          <p key={w.text} className="sx-gen-warning" role="alert">
            {w.text}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div className="sx-gen-preview">
      <div className="sx-gen-preview-head">
        <div>
          <h2>{workout.name}</h2>
          <span className="sx-eyebrow sx-num">
            {workout.items.length} moves · about {workout.estMin} min{limit ? ` (limit ${limit})` : ''} · ~{kcal} kcal
          </span>
        </div>
        <button type="button" onClick={onReroll}>
          Regenerate all
        </button>
      </div>

      {workout.warnings.map((w) => (
        <p key={w.text} className="sx-gen-warning" role="alert">
          {w.text}
        </p>
      ))}

      <p className="sx-helper-text">
        Calories are a rough estimate (±25%), based on {bodyKg ? 'your latest logged body weight' : `an assumed ${DEFAULT_BODY_KG} kg body weight (log yours in Progress for a better number)`}.
      </p>

      {workout.warmupNote && <p className="sx-helper-text">{workout.warmupNote}</p>}

      {workout.items.map((it, i) => {
        const ex = byId[it.exerciseId]
        const partners = it.pairId ? workout.items.filter((o) => o.pairId === it.pairId) : []
        const label = partners.length ? `${it.pairId}${partners.indexOf(it) + 1}` : null
        return (
          <div key={it.exerciseId} className={`sx-entry${label ? ' sx-superset' : ''}`}>
            <div className="sx-entry-header">
              <span className="sx-entry-name">
                {label && <span className="sx-superset-tag">{label}</span>}
                {ex?.name ?? it.exerciseId}
              </span>
              <button type="button" onClick={() => onSwap(i)}>
                Swap
              </button>
            </div>
            <p className="sx-helper-text sx-num">
              {it.sets} × {it.repMin}-{it.repMax} {it.unit === 'sec' ? 'sec' : 'reps'} · rest {it.restSec}s
              {ex ? ` · ${ex.equipment}` : ''}
            </p>
            {ex && <p className="sx-helper-text">{muscleSummary(ex.sub, 3)}</p>}
          </div>
        )
      })}

      {workout.cooldown.length > 0 && (
        <p className="sx-helper-text">
          Cooldown: {workout.cooldown.map((c) => `${c.name} (${c.holdSec}s)`).join(', ')}
        </p>
      )}

      <Coverage workout={workout} volume={volume} />

      <div className="sx-gen-actions">
        <button type="button" className="sx-primary" disabled={!canStart} onClick={onStart}>
          Start session now
        </button>
        {!canStart && <span className="sx-helper-text">Finish or discard your current session first.</span>}
      </div>
      <div className="sx-gen-actions">
        <select className="sx-input" value={saveTarget} onChange={(e) => setSaveTarget(e.target.value)} aria-label="Save to routine">
          <option value="">New routine</option>
          {routines.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={onSave}>
          Save as routine day
        </button>
        {saved && (
          <span className="sx-helper-text" role="status">
            Saved. Find it in the Routine tab.
          </span>
        )}
      </div>
    </div>
  )
}

function Coverage({ workout, volume }) {
  const majors = MAJORS.filter((m) => workout.params.majors.includes(m.id))
  const excluded = new Set(workout.params.excludeSubs)
  return (
    <div className="sx-gen-coverage">
      <span className="sx-eyebrow">Sub-groups covered</span>
      {majors.map((m) => (
        <div key={m.id} className="sx-gen-subgroups">
          <span className="sx-helper-text">{m.name}</span>
          <div className="sx-chip-row">
            {SUBGROUPS.filter((s) => s.major === m.id && !excluded.has(s.id)).map((s) => {
              const v = volume[s.id] || 0
              return (
                <span key={s.id} className={`sx-chip sx-chip-static${v >= 0.5 ? ' sx-active' : ''}`}>
                  {s.name}
                  {v >= 0.5 ? ` ${v.toFixed(1)}` : ''}
                </span>
              )
            })}
          </div>
        </div>
      ))}
      {workout.unreachable.length > 0 && (
        <p className="sx-helper-text">
          Not directly trainable with this equipment and level:{' '}
          {workout.unreachable.map((id) => SUBGROUPS.find((s) => s.id === id)?.name ?? id).join(', ')}.
        </p>
      )}
    </div>
  )
}
