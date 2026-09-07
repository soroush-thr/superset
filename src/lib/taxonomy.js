// Shared lookups over taxonomy.json -- one place for subgroup/major/region
// helpers, instead of every component that touches taxonomy re-deriving
// them. Pure functions, no React.
import taxonomyData from '../data/taxonomy.json'

export const MAJORS = taxonomyData.majors // [{id, name}]
export const SUBGROUPS = taxonomyData.subgroups // [{id, name, major, region}]

export const SUBGROUP_BY_ID = Object.fromEntries(SUBGROUPS.map((s) => [s.id, s]))

export function subgroupName(id) {
  return SUBGROUP_BY_ID[id]?.name ?? id
}

export function subgroupMajor(id) {
  return SUBGROUP_BY_ID[id]?.major ?? null
}

export function subgroupRegion(id) {
  return SUBGROUP_BY_ID[id]?.region ?? null
}

// region id -> a representative sub-group name, used for the BodyMap
// <title> a11y text (section 7.2). When several sub-groups share a region
// (the three triceps heads -> "tricep"), the first one wins; it's a label,
// not a value, so this is fine.
export const REGION_LABELS = (() => {
  const labels = {}
  for (const s of SUBGROUPS) {
    if (!labels[s.region]) labels[s.region] = s.name
  }
  return labels
})()

/** Top N sub-group ids from a `sub` weight map, descending by weight. */
export function topSubgroups(sub, n = 2) {
  return Object.entries(sub || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id)
}

/** A short "2-3 word" muscle summary for a Library row (section 9.1). */
export function muscleSummary(sub, n = 2) {
  return topSubgroups(sub, n).map(subgroupName).join(' / ')
}
