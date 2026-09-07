import React, { useMemo } from 'react'
import { VIEW_BOX, SILHOUETTE_D, FRONT_REGIONS, BACK_REGIONS } from '../lib/bodyRegions.js'
import { heatColor } from '../lib/heat.js'
import { SUBGROUP_BY_ID, REGION_LABELS } from '../lib/taxonomy.js'
import { DEFAULT_TARGETS } from '../lib/constants.js'

// section 7: subgroup id -> region id, built once from taxonomy.json.
const SUBGROUP_TO_REGION = Object.fromEntries(
  Object.entries(SUBGROUP_BY_ID).map(([id, s]) => [id, s.region]),
)

/**
 * Section 7.1: sum every sub-group's value into its region. `values` is
 * keyed by sub-group id (e.g. { pec_mid: 12.4, lat: 8.1 }), matching the
 * shape of weeklyVolume()'s output and of a single exercise's `sub` vector.
 */
function aggregateByRegion(values) {
  const totals = {}
  for (const [subgroupId, value] of Object.entries(values)) {
    const region = SUBGROUP_TO_REGION[subgroupId]
    if (!region) continue
    totals[region] = (totals[region] || 0) + value
  }
  return totals
}

/**
 * Section 7.3: "scaleMax defaults to the highest target ceiling across
 * visible sub-groups." Only applies when the caller omits scaleMax
 * entirely -- the per-exercise preview (section 6.6) always passes
 * scaleMax explicitly (its values are peak-normalized to [0, 1], so this
 * target-based default would be meaningless there).
 */
function defaultScaleMax(values) {
  let max = 1
  for (const subgroupId of Object.keys(values)) {
    const target = DEFAULT_TARGETS[subgroupId]
    if (target) max = Math.max(max, target[1])
  }
  return max
}

/**
 * Renders one view (front or back) of the stylized body map: a shared
 * silhouette underneath, and 15-18 heat-coloured region shapes on top.
 * See BUILD-PLAN.md section 7. Every region is a real DOM node, so hover,
 * focus, and click all work without a canvas or extra library.
 */
export default function BodyMap({ view = 'front', values = {}, scaleMax, onRegionClick }) {
  const regions = view === 'back' ? BACK_REGIONS : FRONT_REGIONS
  const totals = useMemo(() => aggregateByRegion(values), [values])
  const resolvedScaleMax = scaleMax ?? defaultScaleMax(values)

  return (
    <svg className="sx-bodymap" viewBox={VIEW_BOX} role="img" aria-label={`Body map, ${view} view`}>
      <path className="sx-bodymap-silhouette" d={SILHOUETTE_D} />
      {regions.map((region) => {
        const value = totals[region.id] || 0
        const fill = heatColor(value, resolvedScaleMax)
        const label = REGION_LABELS[region.id] ?? region.id
        const handleClick = onRegionClick ? () => onRegionClick(region.id) : undefined

        return (
          <React.Fragment key={region.id}>
            <RegionPath id={region.id} d={region.d} fill={fill} label={label} onClick={handleClick} />
            {region.mirror && (
              <RegionPath
                id={region.id}
                d={region.dMirror}
                fill={fill}
                label={label}
                onClick={handleClick}
                mirrored
              />
            )}
          </React.Fragment>
        )
      })}
    </svg>
  )
}

function RegionPath({ id, d, fill, label, onClick, mirrored }) {
  return (
    <path
      data-region={id}
      d={d}
      fill={fill}
      className="sx-bodymap-region"
      tabIndex={onClick ? 0 : -1}
      role={onClick ? 'button' : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      <title>
        {label}
        {mirrored ? ' (other side)' : ''}
      </title>
    </path>
  )
}
