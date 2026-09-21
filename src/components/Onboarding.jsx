import React, { useState } from 'react'
import { useDispatch } from '../App.jsx'
import { TEMPLATES } from '../lib/templates.js'
import Segmented from './ui/Segmented.jsx'

/**
 * First-run wizard: equipment profile, weight unit, optional starter
 * template. Shown only when there are no routines and no sessions yet
 * (App.jsx), so it never re-appears for anyone with real data -- including
 * someone who deletes everything, since COMPLETE_ONBOARDING is sticky.
 */
export default function Onboarding({ onDone }) {
  const dispatch = useDispatch()
  const [step, setStep] = useState(0)
  const [profile, setProfile] = useState('gym')
  const [unit, setUnit] = useState('kg')

  function finish(templateId) {
    dispatch({ type: 'UPDATE_SETTINGS', patch: { activeProfile: profile, unit } })
    if (templateId) dispatch({ type: 'INSTANTIATE_TEMPLATE', templateId })
    dispatch({ type: 'COMPLETE_ONBOARDING' })
    onDone?.()
  }

  return (
    <div className="sx-onboarding">
      <div className="sx-onboarding-card">
        <span className="sx-eyebrow">Welcome to Superset</span>

        {step === 0 && (
          <>
            <h2>Where do you train?</h2>
            <p className="sx-helper-text">This sets which equipment the Library and suggestions assume you have.</p>
            <Segmented
              value={profile}
              onChange={setProfile}
              options={[
                { value: 'home', label: 'Home' },
                { value: 'gym', label: 'Gym' },
              ]}
            />
            <button type="button" className="sx-primary" onClick={() => setStep(1)}>
              Next
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <h2>Kilograms or pounds?</h2>
            <Segmented
              value={unit}
              onChange={setUnit}
              options={[
                { value: 'kg', label: 'kg' },
                { value: 'lb', label: 'lb' },
              ]}
            />
            <button type="button" className="sx-primary" onClick={() => setStep(2)}>
              Next
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h2>Start from a template?</h2>
            <p className="sx-helper-text">Or skip this and build your own routine from scratch.</p>
            <div className="sx-chip-row">
              {TEMPLATES.map((t) => (
                <button key={t.id} type="button" className="sx-primary" onClick={() => finish(t.id)}>
                  {t.name}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => finish(null)}>
              Skip, I'll build my own
            </button>
          </>
        )}
      </div>
    </div>
  )
}
