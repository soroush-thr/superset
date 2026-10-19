// Rough calorie estimates for resistance training. Pure functions.
//
// Two parts:
//  - A baseline for the time spent: MET 2.5 (standing, moving between sets,
//    heart rate still up) x body weight (kg) x hours.
//  - The lifting itself, from what was actually moved: every rep raises the
//    load (plus the share of body weight that moves with it) through the
//    exercise's range of motion. Muscle turns only about 10% of the energy
//    it burns into that work, so kcal = mass x 9.81 x metres / 0.1 / 4184.
// More reps or more weight therefore means more calories. For a typical
// 45-minute session this lands at the Compendium's 3.5-6 MET for weight
// training; it is still an estimate, good to maybe +/-25%.
import { patternOf } from './generator.js'

export const DEFAULT_BODY_KG = 75

const BASE_MET = 2.5
const HOLD_MET = 4 // planks, wall sits: whole-body isometric effort
const WARMUP_MET = 4.0
const COOLDOWN_MET = 2.3
const WARMUP_SEC = 300
const COOLDOWN_SEC = 300
const KCAL_PER_KG_M = 9.81 / 0.1 / 4184

// Range of motion (m) and the share of body weight that moves, per movement
// pattern (see generator.patternOf). `bw` is the share when the move is done
// with body weight alone (push-up, pull-up, dip...).
const MOTION = {
  squat: { rom: 0.5, body: 0.8, bw: 0.8 },
  hinge: { rom: 0.5, body: 0.5, bw: 0.5 },
  hpush: { rom: 0.4, body: 0.05, bw: 0.65 },
  vpush: { rom: 0.5, body: 0.05, bw: 0.9 },
  hpull: { rom: 0.4, body: 0.05, bw: 0.6 },
  vpull: { rom: 0.5, body: 0.05, bw: 1.0 },
  rear: { rom: 0.4, body: 0.02, bw: 0.1 },
  lateral: { rom: 0.4, body: 0.02, bw: 0.1 },
  shrug: { rom: 0.08, body: 0, bw: 0.1 },
  biceps: { rom: 0.4, body: 0.02, bw: 0.3 },
  triceps: { rom: 0.35, body: 0.02, bw: 0.9 },
  forearm: { rom: 0.1, body: 0, bw: 0.05 },
  core: { rom: 0.3, body: 0.3, bw: 0.3 },
  calf: { rom: 0.08, body: 1.0, bw: 1.0 },
  legother: { rom: 0.3, body: 0.3, bw: 0.3 },
  neck: { rom: 0.1, body: 0, bw: 0.05 },
}
const SINGLE_IMPLEMENT = /one[- ]arm|single[- ]arm|one[- ]hand/i
const motionCache = new WeakMap()

function motionOf(exercise) {
  if (!exercise) return MOTION.hpush
  let m = motionCache.get(exercise)
  if (!m) {
    m = MOTION[exercise.sub ? patternOf(exercise) : 'hpush'] || MOTION.hpush
    motionCache.set(exercise, m)
  }
  return m
}

/** The most recent logged body weight in kg, or null if there is none. */
export function latestBodyKg(bodyLog = []) {
  if (!bodyLog.length) return null
  return [...bodyLog].sort((a, b) => a.date.localeCompare(b.date))[bodyLog.length - 1].weightKg
}

/**
 * Calories for one set from its reps (or seconds, for a hold) and weight.
 * Dumbbells are logged per hand, so a two-handed dumbbell move counts the
 * weight twice. With no weight logged, a typical load is assumed.
 */
export function setKcal({ exercise, weightKg, reps, unit = 'reps', bodyKg }) {
  if (unit === 'sec') return (HOLD_MET * bodyKg * (reps || 30)) / 3600
  const m = motionOf(exercise)
  const equipment = exercise?.equipment
  const bodyOnly = !equipment || equipment === 'body only' || equipment === 'other' || equipment === 'bands'
  let load = weightKg
  if (load == null) load = bodyOnly ? 0 : bodyKg * (exercise?.mechanic === 'compound' ? 0.4 : 0.12)
  if (equipment === 'dumbbell' && !SINGLE_IMPLEMENT.test(exercise?.name || '')) load *= 2
  const moved = load + bodyKg * (bodyOnly ? m.bw : m.body)
  return (reps || 10) * moved * m.rom * KCAL_PER_KG_M
}

/**
 * Estimate for a planned workout. `items` are the generator's
 * { exerciseId, sets, repMin, repMax, unit } entries; `totalSec` is the
 * planned main-work duration (estimateSeconds without warm-up).
 * `weightFor(exerciseId)` gives the weight to assume (e.g. last time's),
 * or null for a typical load.
 */
export function plannedKcal(items, totalSec, bodyKg, { warmup = false, byId = {}, weightFor = () => null } = {}) {
  if (!items.some((it) => it.sets > 0)) return 0
  let total = (BASE_MET * bodyKg * totalSec) / 3600
  for (const it of items) {
    const reps = Math.round(((it.repMin ?? 10) + (it.repMax ?? it.repMin ?? 10)) / 2)
    const per = setKcal({ exercise: byId[it.exerciseId], weightKg: weightFor(it.exerciseId), reps, unit: it.unit, bodyKg })
    total += it.sets * per
  }
  if (warmup) total += (bodyKg * (WARMUP_MET * WARMUP_SEC + COOLDOWN_MET * COOLDOWN_SEC)) / 3600
  return Math.round(total)
}

/**
 * Estimate for a logged session from what was actually done: the reps and
 * weight of every done set, plus the time. Duration is capped so a session
 * left open for hours doesn't inflate the number. Returns null when no sets
 * are done yet.
 */
export function sessionKcal(session, exercisesById, bodyKg, now = Date.now()) {
  let sets = 0
  let work = 0
  for (const entry of session.entries) {
    if (entry.kind === 'cooldown') continue
    const exercise = exercisesById[entry.exerciseId]
    for (const s of entry.sets) {
      if (!s.done) continue
      sets += 1
      work += setKcal({
        exercise,
        weightKg: s.weightKg,
        reps: s.reps ?? entry.targetRepMax,
        unit: entry.targetUnit,
        bodyKg,
      })
    }
  }
  if (sets === 0) return null
  const end = session.endedAt ? new Date(session.endedAt).getTime() : now
  const rawSec = Math.max(0, (end - new Date(session.startedAt).getTime()) / 1000)
  const durationSec = Math.min(rawSec, sets * 240 + 600)
  return Math.round((BASE_MET * bodyKg * durationSec) / 3600 + work)
}
