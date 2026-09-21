import React, { useMemo, useState } from 'react'
import { useDispatch, useExercises } from '../App.jsx'
import { subgroupName } from '../lib/taxonomy.js'
import { BUILTIN_EQUIPMENT } from '../lib/equipment.js'
import Drawer from './ui/Drawer.jsx'
import NumberField from './ui/NumberField.jsx'
import Segmented from './ui/Segmented.jsx'

const LEVELS = ['beginner', 'intermediate', 'expert']
const MECHANICS = ['compound', 'isolation']
const FORCES = ['push', 'pull', 'static']

function label(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const EMPTY_FORM = { equipment: 'body only', level: 'intermediate', mechanic: 'compound', force: 'push' }

/**
 * Create a custom exercise by cloning an existing one's `sub` weight
 * vector and nudging it, rather than building a muscle map from scratch --
 * this keeps custom exercises on the same scale as the curated built-in
 * data so Coverage stays accurate.
 */
export default function CustomExerciseEditor({ open, onClose }) {
  const dispatch = useDispatch()
  const { list: exercises } = useExercises()
  const builtins = useMemo(
    () => exercises.filter((e) => !e.custom).sort((a, b) => a.name.localeCompare(b.name)),
    [exercises],
  )

  const [baseId, setBaseId] = useState('')
  const [name, setName] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [sub, setSub] = useState({})

  function selectBase(id) {
    const base = exercises.find((e) => e.id === id)
    setBaseId(id)
    if (!base) return
    setName(`${base.name} (custom)`)
    setForm({
      equipment: base.equipment ?? 'body only',
      level: base.level ?? 'intermediate',
      mechanic: base.mechanic ?? 'compound',
      force: base.force ?? 'push',
    })
    setSub({ ...(base.sub || {}) })
  }

  function handleClose() {
    setBaseId('')
    setName('')
    setForm(EMPTY_FORM)
    setSub({})
    onClose()
  }

  function handleSave() {
    if (!name.trim() || Object.keys(sub).length === 0) return
    dispatch({ type: 'ADD_CUSTOM_EXERCISE', baseId: baseId || null, name: name.trim(), sub, ...form })
    handleClose()
  }

  const subEntries = Object.entries(sub).sort((a, b) => b[1] - a[1])

  return (
    <Drawer open={open} onClose={handleClose} title="New custom exercise">
      <label className="sx-field">
        <span className="sx-eyebrow">Clone from</span>
        <select className="sx-input" value={baseId} onChange={(e) => selectBase(e.target.value)}>
          <option value="">Choose an exercise to start from...</option>
          {builtins.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.name}
            </option>
          ))}
        </select>
      </label>

      {baseId && (
        <>
          <label className="sx-field">
            <span className="sx-eyebrow">Name</span>
            <input className="sx-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label className="sx-field">
            <span className="sx-eyebrow">Equipment</span>
            <select
              className="sx-input"
              value={form.equipment}
              onChange={(e) => setForm((f) => ({ ...f, equipment: e.target.value }))}
            >
              {BUILTIN_EQUIPMENT.map((eq) => (
                <option key={eq} value={eq}>
                  {label(eq)}
                </option>
              ))}
            </select>
          </label>

          <label className="sx-field">
            <span className="sx-eyebrow">Level</span>
            <Segmented
              value={form.level}
              onChange={(v) => setForm((f) => ({ ...f, level: v }))}
              options={LEVELS.map((l) => ({ value: l, label: label(l) }))}
            />
          </label>

          <label className="sx-field">
            <span className="sx-eyebrow">Mechanic</span>
            <Segmented
              value={form.mechanic}
              onChange={(v) => setForm((f) => ({ ...f, mechanic: v }))}
              options={MECHANICS.map((m) => ({ value: m, label: label(m) }))}
            />
          </label>

          <label className="sx-field">
            <span className="sx-eyebrow">Force</span>
            <Segmented
              value={form.force}
              onChange={(v) => setForm((f) => ({ ...f, force: v }))}
              options={FORCES.map((f) => ({ value: f, label: label(f) }))}
            />
          </label>

          <h3>What this hits</h3>
          <p className="sx-helper-text">
            Cloned from the base exercise -- nudge the weights if this variant hits muscles differently.
          </p>
          <ul className="sx-weight-list">
            {subEntries.map(([subgroupId, weight]) => (
              <li key={subgroupId}>
                <span>{subgroupName(subgroupId)}</span>
                <NumberField
                  value={Math.round(weight * 100)}
                  min={0}
                  max={100}
                  step={5}
                  onChange={(v) => setSub((s) => ({ ...s, [subgroupId]: v / 100 }))}
                />
              </li>
            ))}
          </ul>

          <button type="button" className="sx-primary" onClick={handleSave} disabled={!name.trim()}>
            Save exercise
          </button>
        </>
      )}
    </Drawer>
  )
}
