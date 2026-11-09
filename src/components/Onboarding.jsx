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
const TEMPLATE_BLURBS = {
  ppl: 'Push / pull / legs, built around your week',
  'upper-lower': 'Alternating upper and lower body',
  'full-body': 'Every session trains the whole body',
}
const TEMPLATE_LEVELS = {
  ppl: 'intermediate',
  'upper-lower': 'all levels',
  'full-body': 'beginner friendly',
}
const STEP_COUNT = 3

function templateLine(t) {
  const days = `${t.days.length} day${t.days.length === 1 ? '' : 's'}`
  return `${days} \u00b7 ${TEMPLATE_LEVELS[t.id] ?? 'all levels'}`
}

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
        <div className="sx-onboarding-top">
          <span className="sx-eyebrow">Welcome to Superset</span>
          <span className="sx-eyebrow sx-num">
            Step {step + 1} of {STEP_COUNT}
          </span>
        </div>

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
            <div className="sx-onboarding-nav">
            <button type="button" className="sx-onboarding-back" onClick={() => setStep(0)}>
              Back
            </button>
              <button type="button" className="sx-primary" onClick={() => setStep(2)}>
                Next
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2>Start from a template?</h2>
            <p className="sx-helper-text">Or skip this and build your own routine from scratch.</p>
            <div className="sx-template-list">
              {TEMPLATES.map((t) => (
                <button key={t.id} type="button" className="sx-template-option" onClick={() => finish(t.id)}>
                  <b>{t.name}</b>
                  <span className="sx-num">{templateLine(t)}</span>
                  {TEMPLATE_BLURBS[t.id] && <span>{TEMPLATE_BLURBS[t.id]}</span>}
                </button>
              ))}
            </div>
            <div className="sx-onboarding-nav">
            <button type="button" className="sx-onboarding-back" onClick={() => setStep(1)}>
              Back
            </button>
              <button type="button" onClick={() => finish(null)}>
                Skip, I'll build my own
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
