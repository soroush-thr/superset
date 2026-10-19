// Rest between sets. Pure functions.
//
// settings.restPref is either 'auto' or a fixed number of seconds. Auto
// scales the rest with how heavy the work is: the planned rest (or one
// derived from the exercise when there is no plan), stretched for very low
// reps and hard sets, shortened for high reps and easy ones.

export const REST_CHOICES = [
  { value: 'auto', label: 'Auto' },
  { value: 30, label: '30s' },
  { value: 45, label: '45s' },
  { value: 60, label: '60s' },
  { value: 90, label: '90s' },
  { value: 120, label: '2m' },
]

export function restPrefOf(settings) {
  const p = settings?.restPref
  return typeof p === 'number' && p > 0 ? p : 'auto'
}

const HEAVY_EQUIPMENT = new Set(['barbell', 'machine'])

/** Rest for an unplanned exercise from its equipment and mechanic. */
function baseRest(exercise) {
  if (!exercise || exercise.mechanic !== 'compound') return 45
  return HEAVY_EQUIPMENT.has(exercise.equipment) ? 90 : 75
}

function repsFactor(reps) {
  if (!reps) return 1
  if (reps <= 5) return 1.35
  if (reps <= 7) return 1.15
  if (reps >= 15) return 0.75
  return 1
}

function rpeFactor(rpe) {
  if (rpe == null) return 1
  if (rpe >= 9.5) return 1.3
  if (rpe >= 9) return 1.15
  if (rpe <= 6) return 0.7
  if (rpe <= 7) return 0.85
  return 1
}

/**
 * Seconds to rest after a logged set. `plannedSec` is the entry's target
 * rest (already set for the goal and load); without one the exercise and
 * the reps decide. The set's RPE then nudges either way.
 */
export function restAfterSet({ restPref, plannedSec, exercise, reps, rpe }) {
  if (restPref !== 'auto') return restPref
  const base = plannedSec ?? baseRest(exercise) * repsFactor(reps)
  const sec = base * rpeFactor(rpe)
  return Math.min(240, Math.max(20, Math.round(sec / 5) * 5))
}
