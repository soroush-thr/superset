// Rough calorie estimates for resistance training. Pure functions.
//
// Energy = MET x body weight (kg) x hours, using Compendium-of-Physical-
// Activities style values: lifting sets run at about 5-7 MET (more for
// big compound lifts), resting between sets about 2 MET. The result is an
// estimate, good to maybe +/-25% -- real burn depends on load, pace, and
// the individual.

export const DEFAULT_BODY_KG = 75

const WORK_SEC_PER_SET = 40
const REST_MET = 2.0
const WARMUP_MET = 4.0
const COOLDOWN_MET = 2.3
const WARMUP_SEC = 300
const COOLDOWN_SEC = 300

/** The most recent logged body weight in kg, or null if there is none. */
export function latestBodyKg(bodyLog = []) {
  if (!bodyLog.length) return null
  return [...bodyLog].sort((a, b) => a.date.localeCompare(b.date))[bodyLog.length - 1].weightKg
}

function kcal(bodyKg, workSec, restSec, compoundShare) {
  const workMet = 5 + 2 * compoundShare // 5 MET isolation-only .. 7 MET all compound
  return (bodyKg * (workMet * workSec + REST_MET * restSec)) / 3600
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
  const workSec = Math.min(sets * WORK_SEC_PER_SET, totalSec)
  let total = kcal(bodyKg, workSec, Math.max(0, totalSec - workSec), compoundSets / sets)
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
  const durationSec = Math.min(rawSec, sets * 300 + 600)
  const workSec = Math.min(sets * WORK_SEC_PER_SET, durationSec)
  return Math.round(kcal(bodyKg, workSec, durationSec - workSec, compoundSets / sets))
}
