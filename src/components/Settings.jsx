import React, { useRef, useState } from 'react'
import { useStore } from '../App.jsx'
import { serialize, deserialize, targetsWithDefaults, flushSave } from '../lib/store.js'
import { SUBGROUPS, MAJORS, subgroupName } from '../lib/taxonomy.js'
import { ALL_EQUIPMENT } from '../lib/equipment.js'
import exercisesData from '../data/exercises.json'
import taxonomyData from '../data/taxonomy.json'
import NumberField from './ui/NumberField.jsx'
import Segmented from './ui/Segmented.jsx'

const LEVELS = ['beginner', 'intermediate', 'expert']

function label(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function todayFilename() {
  return `superset-${new Date().toISOString().slice(0, 10)}.json`
}

/**
 * Section 9.5: equipment profiles, max level, credit mode, per-sub-group
 * targets, export/import, reset to defaults, and honest data provenance.
 */
export default function Settings() {
  const { state, dispatch } = useStore()
  const fileInputRef = useRef(null)
  const [importError, setImportError] = useState(null)

  function toggleEquipment(profileName, equipment) {
    const current = state.settings.equipmentProfiles[profileName]
    const next = current.includes(equipment)
      ? current.filter((e) => e !== equipment)
      : [...current, equipment]
    dispatch({
      type: 'UPDATE_SETTINGS',
      patch: {
        equipmentProfiles: { ...state.settings.equipmentProfiles, [profileName]: next },
      },
    })
  }

  function handleExport() {
    const blob = new Blob([serialize(state)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = todayFilename()
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImportFile(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = deserialize(reader.result)
        const count = parsed.routines?.length ?? 0
        const ok = window.confirm(
          `Import will replace all current data with the imported file, overwriting ` +
            `${state.routines.length} existing routine${state.routines.length === 1 ? '' : 's'} ` +
            `with ${count} imported routine${count === 1 ? '' : 's'}. Continue?`,
        )
        if (!ok) return
        dispatch({ type: 'REPLACE_STATE', state: parsed })
        flushSave(parsed)
        setImportError(null)
      } catch (err) {
        setImportError(err.message)
      }
    }
    reader.readAsText(file)
  }

  function handleReset() {
    if (window.confirm('Reset all settings to defaults? Routines are not affected.')) {
      dispatch({ type: 'RESET_SETTINGS' })
    }
  }

  const targets = targetsWithDefaults(state)
  const reviewedCount = exercisesData.filter((e) => e.reviewed).length

  return (
    <div>
      <span className="sx-eyebrow">Settings</span>
      <h2>Settings</h2>

      <Section title="Equipment profiles">
        <div className="sx-equipment-profiles">
          {['home', 'gym'].map((profileName) => (
            <div key={profileName} className="sx-equipment-profile">
              <span className="sx-eyebrow">{label(profileName)}</span>
              <div className="sx-checkbox-list">
                {ALL_EQUIPMENT.map((eq) => (
                  <label key={eq} className="sx-checkbox-item">
                    <input
                      type="checkbox"
                      checked={state.settings.equipmentProfiles[profileName].includes(eq)}
                      onChange={() => toggleEquipment(profileName, eq)}
                    />
                    {label(eq)}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Max level">
        <Segmented
          value={state.settings.maxLevel}
          onChange={(v) => dispatch({ type: 'UPDATE_SETTINGS', patch: { maxLevel: v } })}
          options={LEVELS.map((l) => ({ value: l, label: label(l) }))}
        />
      </Section>

      <Section title="Credit mode">
        <Segmented
          value={state.settings.creditMode}
          onChange={(v) => dispatch({ type: 'UPDATE_SETTINGS', patch: { creditMode: v } })}
          options={[
            { value: 'peak', label: 'Peak' },
            { value: 'fraction', label: 'Fraction' },
          ]}
        />
      </Section>

      <Section title="Weekly targets (effective sets)">
        <div className="sx-targets-table">
          {MAJORS.map((major) => (
            <div key={major.id}>
              <span className="sx-eyebrow sx-targets-major">{major.name}</span>
              {SUBGROUPS.filter((s) => s.major === major.id).map((s) => (
                <div key={s.id} className="sx-targets-row">
                  <span className="sx-targets-name">{subgroupName(s.id)}</span>
                  <NumberField
                    label="Min"
                    value={targets[s.id][0]}
                    min={0}
                    max={targets[s.id][1]}
                    onChange={(v) =>
                      dispatch({ type: 'SET_TARGET', subgroupId: s.id, range: [v, targets[s.id][1]] })
                    }
                  />
                  <NumberField
                    label="Max"
                    value={targets[s.id][1]}
                    min={targets[s.id][0]}
                    max={100}
                    onChange={(v) =>
                      dispatch({ type: 'SET_TARGET', subgroupId: s.id, range: [targets[s.id][0], v] })
                    }
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Data">
        <div className="sx-data-actions">
          <button type="button" onClick={handleExport}>
            Export
          </button>
          <button type="button" onClick={() => fileInputRef.current.click()}>
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
          <button type="button" onClick={handleReset}>
            Reset settings to defaults
          </button>
        </div>
        {importError && <p className="sx-import-error">Import failed: {importError}</p>}
      </Section>

      <Section title="Provenance">
        <ul className="sx-provenance-list">
          <li>
            <span>Dataset</span>
            <span>free-exercise-db (yuhonas), public domain</span>
          </li>
          <li>
            <span>Exercises</span>
            <span className="sx-num">{exercisesData.length}</span>
          </li>
          <li>
            <span>Taxonomy version</span>
            <span className="sx-num">{taxonomyData.version}</span>
          </li>
          <li>
            <span>Reviewed / auto-mapped</span>
            <span className="sx-num">
              {reviewedCount} / {exercisesData.length - reviewedCount}
            </span>
          </li>
        </ul>
      </Section>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="sx-settings-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}
