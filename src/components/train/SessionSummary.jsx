import React, { useEffect, useMemo, useState } from 'react'
import { useStore, useBodyMapFeed, useExercises } from '../../App.jsx'
import BodyMap, { aggregateByRegion } from '../BodyMap.jsx'
import { sessionSummary } from '../../lib/sessionStats.js'
import { summarySvg, svgToPngBlob, shareOrSavePng } from '../../lib/summaryImage.js'
import { DEFAULT_BODY_KG, latestBodyKg, sessionKcal } from '../../lib/calories.js'
import { REGION_LABELS } from '../../lib/taxonomy.js'
import { formatWeight, toDisplay } from '../../lib/units.js'

// The most-trained muscle lands on the "in range" stop of the heat ramp, not
// the "over ceiling" one: one session is never over a weekly ceiling.
const PEAK_T = 0.75

function formatDuration(ms) {
  const mins = Math.max(0, Math.round(ms / 60000))
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
}

/** Counts from 0 up to `target` over `ms`, easing out. Jumps straight to the
 *  target under prefers-reduced-motion. */
function useCountUp(target, ms = 900) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!target || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return undefined
    }
    let raf
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms)
      setValue(target * (1 - Math.pow(1 - t, 3)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return value
}

function recordText(record, name, unit) {
  if (record.kind === 'reps') return `${name}: ${record.reps} reps (+${record.gain})`
  return `${name}: ${formatWeight(record.weightKg, unit)} × ${record.reps}`
}

/**
 * Shown right after Finish: the session as one card. Hero numbers that count
 * up, the body lit with what was trained, and any personal records. Can be
 * saved or shared as an image. Also feeds the shell's sticky body map.
 */
export default function SessionSummary({ session, onDone }) {
  const { state } = useStore()
  const { byId: exercisesById } = useExercises()
  const unit = state.settings.unit ?? 'kg'
  const [shareState, setShareState] = useState('idle')

  const summary = useMemo(
    () => sessionSummary(session, state.sessions, exercisesById, state.settings.creditMode),
    [session, state.sessions, exercisesById, state.settings.creditMode],
  )
  const regionTotals = useMemo(() => aggregateByRegion(summary.muscles), [summary.muscles])
  const peak = Math.max(0, ...Object.values(regionTotals))
  const scaleMax = peak > 0 ? peak / PEAK_T : 1
  const topRegions = Object.entries(regionTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => REGION_LABELS[id] ?? id)

  useBodyMapFeed(useMemo(() => ({ front: summary.muscles, back: summary.muscles, scaleMax }), [summary.muscles, scaleMax]))

  const kcal = sessionKcal(session, exercisesById, latestBodyKg(state.bodyLog) ?? DEFAULT_BODY_KG)
  const volumeDisplay = Math.round(toDisplay(summary.volumeKg, unit))
  const minutes = Math.round(summary.durationMs / 60000)

  const animatedVolume = useCountUp(volumeDisplay)
  const animatedSets = useCountUp(summary.sets)
  const animatedMinutes = useCountUp(minutes)

  const title = session.dayName || 'Ad-hoc session'
  const dateLabel = new Date(session.startedAt).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const nameOf = (id) => exercisesById[id]?.name ?? id
  const muscleLabel = topRegions.length ? `Muscles trained: ${topRegions.join(', ')}` : 'No muscles trained'

  async function handleShare() {
    setShareState('busy')
    try {
      const svg = summarySvg({
        title,
        dateLabel,
        stats: [
          { value: formatDuration(summary.durationMs), label: 'Duration' },
          { value: volumeDisplay.toLocaleString(), label: `Volume ${unit}` },
          { value: String(summary.sets), label: 'Sets' },
        ],
        regionTotals,
        scaleMax,
        records: summary.records.map((r) => recordText(r, nameOf(r.exerciseId), unit)),
      })
      const blob = await svgToPngBlob(svg)
      const stamp = new Date(session.startedAt).toISOString().slice(0, 10)
      const result = await shareOrSavePng(blob, `superset-${stamp}.png`)
      setShareState(result === 'saved' ? 'saved' : 'idle')
    } catch {
      setShareState('failed')
    }
  }

  return (
    <section className="sx-summary" aria-label="Session summary">
      <div className="sx-summary-card">
        <header className="sx-summary-head">
          <span className="sx-eyebrow">Session complete · {dateLabel}</span>
          <h2>{title}</h2>
        </header>

        <dl className="sx-summary-stats">
          <div>
            <dd className="sx-num">
              {minutes < 60 ? Math.round(animatedMinutes) : formatDuration(summary.durationMs)}
            </dd>
            <dt className="sx-eyebrow">{minutes < 60 ? 'Minutes' : 'Duration'}</dt>
          </div>
          <div>
            <dd className="sx-num">{Math.round(animatedVolume).toLocaleString()}</dd>
            <dt className="sx-eyebrow">Volume · {unit}</dt>
          </div>
          <div>
            <dd className="sx-num">{Math.round(animatedSets)}</dd>
            <dt className="sx-eyebrow">Sets</dt>
          </div>
        </dl>

        <div className="sx-summary-body">
          <div className="sx-summary-maps">
            <BodyMap mini view="front" values={summary.muscles} scaleMax={scaleMax} label={`${muscleLabel} (front)`} />
            <BodyMap mini view="back" values={summary.muscles} scaleMax={scaleMax} label={`${muscleLabel} (back)`} />
          </div>

          <div className="sx-summary-side">
            <div>
              <span className="sx-eyebrow">Most trained</span>
              <p className="sx-summary-muscles">{topRegions.length ? topRegions.join(' · ') : 'Nothing logged'}</p>
              <p className="sx-helper-text sx-num">
                {summary.exercises} exercise{summary.exercises === 1 ? '' : 's'} · {summary.reps} reps
                {kcal != null ? ` · ~${kcal} kcal` : ''}
              </p>
            </div>

            {summary.records.length > 0 && (
              <div>
                <span className="sx-eyebrow sx-summary-record-title">
                  {summary.records.length} personal record{summary.records.length === 1 ? '' : 's'}
                </span>
                <ul className="sx-summary-records">
                  {summary.records.map((r, i) => (
                    <li key={r.exerciseId} style={{ animationDelay: `${500 + i * 90}ms` }}>
                      <span className="sx-summary-badge" aria-hidden="true">
                        PR
                      </span>
                      <span className="sx-summary-record-name">{nameOf(r.exerciseId)}</span>
                      <span className="sx-num sx-summary-record-value">
                        {r.kind === 'reps' ? (
                          <>
                            {r.reps} reps <em>+{r.gain}</em>
                          </>
                        ) : (
                          <>
                            {formatWeight(r.weightKg, unit)} × {r.reps}{' '}
                            <em>+{formatWeight(r.gain, unit)} est. 1RM</em>
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="sx-summary-actions">
        <button type="button" className="sx-primary" onClick={onDone}>
          Done
        </button>
        <button type="button" onClick={handleShare} disabled={shareState === 'busy'}>
          {shareState === 'busy' ? 'Preparing…' : 'Share image'}
        </button>
        <span className="sx-helper-text" role="status">
          {shareState === 'saved' && 'Image saved to your downloads.'}
          {shareState === 'failed' && 'Could not create the image on this device.'}
        </span>
      </div>
    </section>
  )
}
