import React, { useRef, useState } from 'react'
import ConfirmButton from './ui/ConfirmButton.jsx'
import { useStore } from '../App.jsx'
import { serialize, deserialize, targetsWithDefaults, flushSave } from '../lib/store.js'
import { SUBGROUPS, MAJORS, subgroupName } from '../lib/taxonomy.js'
import { allEquipment } from '../lib/equipment.js'
import { BUILTIN_EXERCISES } from '../lib/exercises.js'
import taxonomyData from '../data/taxonomy.json'
import NumberField from './ui/NumberField.jsx'
import Segmented from './ui/Segmented.jsx'
import OwnedWeights from './ui/OwnedWeights.jsx'
import { REST_CHOICES, restPrefOf } from '../lib/rest.js'
import { OWNABLE_EQUIPMENT } from '../lib/weights.js'

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
  const [pendingImport, setPendingImport] = useState(null)

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
        setPendingImport(deserialize(reader.result))
        setImportError(null)
      } catch (err) {
        setImportError(err.message)
      }
    }
    reader.readAsText(file)
  }

  function applyImport() {
    dispatch({ type: 'REPLACE_STATE', state: pendingImport })
    flushSave(pendingImport)
    setPendingImport(null)
  }

  const targets = targetsWithDefaults(state)
  const reviewedCount = BUILTIN_EXERCISES.filter((e) => e.reviewed).length
  const equipmentList = allEquipment(state.customExercises)

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
                {equipmentList.map((eq) => (
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

      <Section title="Your weights">
        <p className="sx-helper-text">
          Pick the dumbbells and kettlebells you own and the weight picker while logging offers only those.
        </p>
        {OWNABLE_EQUIPMENT.map((eq) => (
          <OwnedWeights
            key={eq}
            equipment={eq}
            unit={state.settings.unit ?? 'kg'}
            ownedWeights={state.settings.ownedWeights}
            onChange={(ownedWeights) => dispatch({ type: 'UPDATE_SETTINGS', patch: { ownedWeights } })}
          />
        ))}
      </Section>

      <Section title="Rest between sets">
        <Segmented
          value={restPrefOf(state.settings)}
          onChange={(v) => dispatch({ type: 'UPDATE_SETTINGS', patch: { restPref: v } })}
          options={REST_CHOICES}
        />
        <p className="sx-helper-text">
          Auto scales the rest with the load: longer after heavy, low-rep or hard (high RPE) sets, shorter after light ones.
        </p>
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

      <Section title="Weight unit">
        <Segmented
          value={state.settings.unit ?? 'kg'}
          onChange={(v) => dispatch({ type: 'UPDATE_SETTINGS', patch: { unit: v } })}
          options={[
            { value: 'kg', label: 'kg' },
            { value: 'lb', label: 'lb' },
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
          <ConfirmButton
            confirmLabel="Tap again to reset (routines are kept)"
            onConfirm={() => dispatch({ type: 'RESET_SETTINGS' })}
          >
            Reset settings to defaults
          </ConfirmButton>
        </div>
        {importError && <p className="sx-import-error">Import failed: {importError}</p>}
        {pendingImport && (
          <div className="sx-import-confirm" role="alert">
            <p className="sx-helper-text">
              Import replaces all current data, overwriting {state.routines.length} existing routine
              {state.routines.length === 1 ? '' : 's'} with {pendingImport.routines?.length ?? 0} imported routine
              {(pendingImport.routines?.length ?? 0) === 1 ? '' : 's'}.
            </p>
            <div className="sx-data-actions">
              <button type="button" className="sx-primary" onClick={applyImport}>
                Replace my data
              </button>
              <button type="button" onClick={() => setPendingImport(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Section>

      <Section title="Provenance">
        <ul className="sx-provenance-list">
          <li>
            <span>Dataset</span>
            <span>free-exercise-db (yuhonas), public domain</span>
          </li>
          <li>
            <span>Exercises</span>
            <span className="sx-num">{BUILTIN_EXERCISES.length}</span>
          </li>
          <li>
            <span>Taxonomy version</span>
            <span className="sx-num">{taxonomyData.version}</span>
          </li>
          <li>
            <span>Reviewed / auto-mapped</span>
            <span className="sx-num">
              {reviewedCount} / {BUILTIN_EXERCISES.length - reviewedCount}
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
