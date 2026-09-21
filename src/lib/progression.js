// Suggests when to add weight: if the last time this exercise was logged,
// every set was at the same weight and hit the top of the planned rep
// range, suggest bumping the weight by one plate increment. Advisory only
// -- callers surface it as a dismissible hint, never apply it automatically.
import { incrementKgFor, roundToIncrement } from './units.js'

/**
 * `last` is the { session, entry, sets } shape from sessions.js's
 * lastSessionFor. `targetRepMax` is the *current* entry's target, since the
 * plan may have changed since last time. Returns { weightKg } or null.
 */
export function suggestNextLoad(last, targetRepMax, unit) {
  if (!last || last.sets.length === 0 || targetRepMax == null) return null

  const weight = last.sets[0].weightKg
  if (weight == null) return null

  const allSameWeight = last.sets.every((s) => s.weightKg === weight)
  const allHitTop = last.sets.every((s) => s.reps != null && s.reps >= targetRepMax)
  if (!allSameWeight || !allHitTop) return null

  return { weightKg: roundToIncrement(weight + incrementKgFor(unit), unit) }
}
