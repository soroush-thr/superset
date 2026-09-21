// All weekly-volume math. Pure functions, no React imports, no side effects.
// See BUILD-PLAN.md section 6 for the model this implements.

const LEVEL_ORDER = { beginner: 0, intermediate: 1, expert: 2 }

// Section 6.5 scoring constants.
const SATURATION_PENALTY = 0.6
const COMPOUND_BONUS = 0.15

/**
 * Section 6.1: each day in a routine occurs once per cycleDays, so every
 * slot in every day is scaled by 7 / cycleDays to get a weekly figure.
 */
export function weeklyFactor(routine) {
  return 7 / routine.cycleDays
}

/**
 * Section 6.2: per-set credit toward each sub-group, in either mode.
 * `peak` rescales so the single most-targeted sub-group earns a full set;
 * `fraction` distributes exactly 1.0 total credit per set across all
 * sub-groups. Returns a fresh { subgroupId: credit } map (only sub-groups
 * the exercise touches at all).
 */
export function creditForEntry(entry, exercise, mode = 'peak') {
  const w = exercise.sub
  const credit = {}
  if (!w) return credit

  if (mode === 'fraction') {
    for (const [g, weight] of Object.entries(w)) {
      credit[g] = entry.sets * weight
    }
    return credit
  }

  // peak mode (default)
  const maxW = Math.max(...Object.values(w))
  if (maxW <= 0) return credit
  for (const [g, weight] of Object.entries(w)) {
    credit[g] = (entry.sets * weight) / maxW
  }
  return credit
}

/**
 * Sum credit(g) * factor over a flat list of entries ({ exerciseId, sets }).
 * Returns { subgroupId: number }. Never rounds internally — round only for
 * display. `factor` defaults to 1 (raw, unscaled) so this also works for
 * logged session sets, not just routine entries.
 */
export function volumeForEntries(entries, exercisesById, mode = 'peak', factor = 1) {
  const totals = {}
  for (const entry of entries) {
    const exercise = exercisesById[entry.exerciseId]
    if (!exercise) continue
    const credit = creditForEntry(entry, exercise, mode)
    for (const [g, c] of Object.entries(credit)) {
      totals[g] = (totals[g] || 0) + c * factor
    }
  }
  return totals
}

/**
 * Section 6.3: sum credit(g) * weeklyFactor over every entry in every slot
 * in every day of the routine. Returns { subgroupId: number }. Never rounds
 * internally — round only for display.
 */
export function weeklyVolume(routine, exercisesById, mode = 'peak') {
  const entries = []
  for (const day of routine.days) {
    for (const slot of day.slots) {
      for (const entry of slot.entries) entries.push(entry)
    }
  }
  return volumeForEntries(entries, exercisesById, mode, weeklyFactor(routine))
}

/**
 * Section 6.4: status of a single sub-group's weekly volume against its
 * [min, max] target range.
 */
export function statusFor(value, target) {
  if (!target) return null
  const [min, max] = target
  if (value < min) return 'below'
  if (value > max) return 'above'
  return 'in'
}

/** Section 6.4: how far under the minimum this sub-group is, floored at 0. */
export function deficitFor(value, target) {
  if (!target) return 0
  const [min] = target
  return Math.max(0, min - value)
}

/**
 * Convenience roll-up combining 6.3 and 6.4: for every sub-group with a
 * target, its current value, status, and deficit.
 */
export function computeStatuses(volume, targets) {
  const out = {}
  for (const [g, target] of Object.entries(targets)) {
    const value = volume[g] || 0
    out[g] = { value, status: statusFor(value, target), deficit: deficitFor(value, target) }
  }
  return out
}

/**
 * Section 6.2 peak-normalized weight vector for one exercise, independent of
 * any routine. Used both for gap scoring (6.5) and the per-exercise preview
 * (6.6).
 */
export function peakNormalize(sub) {
  if (!sub) return {}
  const maxW = Math.max(...Object.values(sub))
  if (maxW <= 0) return {}
  const out = {}
  for (const [g, w] of Object.entries(sub)) out[g] = w / maxW
  return out
}

/**
 * Section 6.5: rank candidate exercises for a single gapped sub-group.
 *   score = w_norm[g]
 *         - 0.6 * sum_over_saturated_g'( w_norm[g'] )
 *         + 0.15 * (mechanic === "compound" ? 1 : 0)
 * `saturatedGroups` is the set of sub-group ids currently at status "above".
 */
function scoreExercise(exercise, subgroupId, saturatedGroups) {
  const wNorm = peakNormalize(exercise.sub)
  const target = wNorm[subgroupId] || 0
  if (target <= 0) return null

  let penalty = 0
  for (const g of saturatedGroups) {
    if (g === subgroupId) continue
    penalty += wNorm[g] || 0
  }

  const bonus = exercise.mechanic === 'compound' ? COMPOUND_BONUS : 0
  return target - SATURATION_PENALTY * penalty + bonus
}

/**
 * Section 6.5: for every sub-group currently "below" target, return the top
 * 5 candidate exercises ranked by scoreExercise, filtered to the active
 * equipment profile and maxLevel, excluding exercises already in the
 * routine. Returns { subgroupId: [{ exercise, score }, ...] }.
 */
export function suggestExercises({
  statuses,
  exercises,
  equipmentProfile,
  maxLevel,
  excludeIds = new Set(),
}) {
  const maxLevelRank = LEVEL_ORDER[maxLevel] ?? LEVEL_ORDER.expert
  const equipmentSet = new Set(equipmentProfile)

  const eligible = exercises.filter((e) => {
    if (excludeIds.has(e.id)) return false
    if (!equipmentSet.has(e.equipment)) return false
    const levelRank = LEVEL_ORDER[e.level] ?? LEVEL_ORDER.expert
    if (levelRank > maxLevelRank) return false
    return true
  })

  const saturatedGroups = new Set(
    Object.entries(statuses)
      .filter(([, s]) => s.status === 'above')
      .map(([g]) => g),
  )

  const result = {}
  for (const [subgroupId, s] of Object.entries(statuses)) {
    if (s.status !== 'below') continue

    const scored = []
    for (const exercise of eligible) {
      const score = scoreExercise(exercise, subgroupId, saturatedGroups)
      if (score === null) continue
      scored.push({ exercise, score })
    }
    scored.sort((a, b) => b.score - a.score)
    result[subgroupId] = scored.slice(0, 5)
  }
  return result
}

function cosineSimilarity(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  let dot = 0
  let normA = 0
  let normB = 0
  for (const k of keys) {
    const av = a[k] || 0
    const bv = b[k] || 0
    dot += av * bv
    normA += av * av
    normB += bv * bv
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Rank candidate exercises as substitutes for `exerciseId` by cosine
 * similarity of their `sub` weight vectors -- how similarly they distribute
 * load across the same sub-groups, not just which majors they share.
 * Filtered to the active equipment profile and maxLevel, same gate as
 * suggestExercises. `index` is the { list, byId } shape from
 * buildExerciseIndex, so custom exercises are eligible candidates too.
 */
export function substitutesFor(exerciseId, { index, equipmentProfile, maxLevel, n = 5 }) {
  const source = index.byId[exerciseId]
  if (!source?.sub) return []

  const maxLevelRank = LEVEL_ORDER[maxLevel] ?? LEVEL_ORDER.expert
  const equipmentSet = new Set(equipmentProfile)

  const scored = []
  for (const candidate of index.list) {
    if (candidate.id === exerciseId || !candidate.sub) continue
    if (!equipmentSet.has(candidate.equipment)) continue
    const levelRank = LEVEL_ORDER[candidate.level] ?? LEVEL_ORDER.expert
    if (levelRank > maxLevelRank) continue
    const score = cosineSimilarity(source.sub, candidate.sub)
    if (score <= 0) continue
    scored.push({ exercise: candidate, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, n)
}

/** Scale a { subgroupId: number } volume map by a flat factor -- used to
 *  preview a deload week (routine.weeks) without changing weeklyVolume's
 *  signature. factor 1 is a no-op (returns the same object, not a copy). */
export function scaleVolume(volume, factor) {
  if (factor === 1) return volume
  return Object.fromEntries(Object.entries(volume).map(([g, v]) => [g, v * factor]))
}
