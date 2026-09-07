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
 * Section 6.3: sum credit(g) * weeklyFactor over every entry in every slot
 * in every day of the routine. Returns { subgroupId: number }. Never rounds
 * internally — round only for display.
 */
export function weeklyVolume(routine, exercisesById, mode = 'peak') {
  const totals = {}
  const factor = weeklyFactor(routine)

  for (const day of routine.days) {
    for (const slot of day.slots) {
      for (const entry of slot.entries) {
        const exercise = exercisesById[entry.exerciseId]
        if (!exercise) continue
        const credit = creditForEntry(entry, exercise, mode)
        for (const [g, c] of Object.entries(credit)) {
          totals[g] = (totals[g] || 0) + c * factor
        }
      }
    }
  }

  return totals
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
