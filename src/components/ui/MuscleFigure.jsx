import React, { useMemo } from 'react'
import BodyMap, { aggregateByRegion } from '../BodyMap.jsx'
import { FRONT_REGIONS, BACK_REGIONS } from '../../lib/bodyRegions.js'

// Same convention as the session summary card: the hottest region sits on the
// "in range" stop of the heat ramp, so nothing is ever drawn at the red "over
// ceiling" colour. These pictures show shape, not a verdict against a target.
const PEAK_T = 0.75

const sumRegions = (regions, totals) => regions.reduce((sum, r) => sum + (totals[r.id] || 0), 0)

/**
 * A small decorative muscle picture for rows and cards. `values` is a
 * sub-group map ({ subgroupId: number }) -- an exercise's own `sub` weights, a
 * day's volume, a session's set credit -- and the figure scales itself, so
 * callers never pick a `scaleMax`.
 *
 * `views`: 'both' draws front and back side by side; 'auto' draws only the
 * side carrying more heat (front on a tie), which keeps a one-figure thumbnail
 * legible at 44px. Size comes from CSS (`--sx-figure-h`), not from props.
 *
 * Memoised: it renders once per visible row of the virtualised Library list.
 */
function MuscleFigure({ values, views = 'auto', label, className }) {
  const { scaleMax, view } = useMemo(() => {
    const totals = aggregateByRegion(values ?? {})
    const peak = Math.max(0, ...Object.values(totals))
    return {
      scaleMax: peak > 0 ? peak / PEAK_T : 1,
      view: sumRegions(BACK_REGIONS, totals) > sumRegions(FRONT_REGIONS, totals) ? 'back' : 'front',
    }
  }, [values])

  const shown = views === 'both' ? ['front', 'back'] : [view]
  const base = label ?? 'Muscles worked'

  return (
    <span className={`sx-figure${className ? ` ${className}` : ''}`}>
      {shown.map((v) => (
        <BodyMap
          key={v}
          mini
          view={v}
          values={values ?? {}}
          scaleMax={scaleMax}
          label={views === 'both' ? `${base} (${v})` : base}
        />
      ))}
    </span>
  )
}

export default React.memo(MuscleFigure)
