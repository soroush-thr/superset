// Rough calorie estimates for resistance training. Pure functions.
//
// Energy = MET x body weight (kg) x hours, with one MET value for the whole
// session (lifting plus the rests between sets, as the Compendium of Physical
// Activities does: about 3.5 for light effort up to 6 for vigorous). Here the
// MET runs from about 3.8 (all isolation work) to 5.5 (all compound lifts),
// scaled by how densely the sets are packed into the time. The result is an
// estimate, good to maybe +/-25% -- real burn depends on load, pace, and
// the individual.

export const DEFAULT_BODY_KG = 75

const WARMUP_MET = 4.0
const COOLDOWN_MET = 2.3
const WARMUP_SEC = 300
const COOLDOWN_SEC = 300

/** The most recent logged body weight in kg, or null if there is none. */
export function latestBodyKg(bodyLog = []) {
  if (!bodyLog.length) return null
  return [...bodyLog].sort((a, b) => a.date.localeCompare(b.date))[bodyLog.length - 1].weightKg
}

function sessionMet(sets, durationSec, compoundShare) {
  const base = 3.8 + 1.7 * compoundShare
  const setsPer10Min = sets / Math.max(durationSec / 600, 0.5)
  const density = Math.min(1.15, Math.max(0.8, setsPer10Min / 3)) // 3 sets per 10 min is a normal pace
  return base * density
}

/**
 * Estimate for a generated (planned) workout. `items` are the generator's
 * { sets, compound } entries; `totalSec` is the planned main-work duration
 * (estimateSeconds without warm-up); warm-up/cooldown add a fixed block.
 */
export function plannedKcal(items, totalSec, bodyKg, { warmup = false } = {}) {
  const sets = items.reduce((s, it) => s + it.sets, 0)
  if (sets === 0) return 0
  const compoundSets = items.reduce((s, it) => s + (it.compound ? it.sets : 0), 0)
  let total = (bodyKg * sessionMet(sets, totalSec, compoundSets / sets) * totalSec) / 3600
  if (warmup) total += (bodyKg * (WARMUP_MET * WARMUP_SEC + COOLDOWN_MET * COOLDOWN_SEC)) / 3600
  return Math.round(total)
}

/**
 * Estimate for a logged session from what was actually done. Duration is
 * capped so a session left open for hours doesn't inflate the number.
 * Returns null when no sets are done yet.
 */
export function sessionKcal(session, exercisesById, bodyKg, now = Date.now()) {
  let sets = 0
  let compoundSets = 0
  for (const entry of session.entries) {
    if (entry.kind === 'cooldown') continue
    const n = entry.sets.filter((s) => s.done).length
    sets += n
    if (exercisesById[entry.exerciseId]?.mechanic === 'compound') compoundSets += n
  }
  if (sets === 0) return null
  const end = session.endedAt ? new Date(session.endedAt).getTime() : now
  const rawSec = Math.max(0, (end - new Date(session.startedAt).getTime()) / 1000)
  const durationSec = Math.min(rawSec, sets * 360 + 600)
  return Math.round((bodyKg * sessionMet(sets, durationSec, compoundSets / sets) * durationSec) / 3600)
}
