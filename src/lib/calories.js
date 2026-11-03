// Calorie estimates for resistance training. Pure functions.
//
// Two parts, both driven by what was actually done:
//  - The lifting itself. Every rep raises the load, plus whatever share of
//    your body weight moves with it, through the exercise's range of motion.
//    Muscle turns only about 10% of the energy it burns into that lift
//    (the lowering phase and holding tension cost the rest), so
//    kcal = mass x 9.81 x metres / 0.1 / 4184.
//  - The time the sets take: MET 2.5 (standing, setting up, heart rate still
//    up between sets) x body weight x hours. That time comes from the sets
//    done -- reps at ~3 s each plus the planned rest -- not the wall clock,
//    so the number rises when you finish a set, not while you sit idle.
//
// The range of motion and the share of body weight are worked out per
// exercise from its name (a push-up lifts ~65% of you, a bench press only
// your arms; a seated calf raise none of you, a standing one all of you).
// One-sided moves are logged per side, so they count twice. A typical
// 45-minute session lands at the Compendium's 3.5-6 MET for weight
// training; it is still an estimate, good to maybe +/-25%.
import { patternOf, UNILATERAL_NAME } from './generator.js'

export const DEFAULT_BODY_KG = 75

const BASE_MET = 2.5
const HOLD_MET = 4 // planks, wall sits: whole-body isometric effort
const WARMUP_MET = 4.0
const COOLDOWN_MET = 2.3
const WARMUP_SEC = 300
const COOLDOWN_SEC = 300
const KCAL_PER_KG_M = 9.81 / 0.1 / 4184
// Set timing, matching the generator's estimateSeconds.
const SEC_PER_REP = 3
const SET_OVERHEAD_SEC = 10
const SETUP_SEC = 45 // per exercise
const DEFAULT_REST_SEC = 90
const MAX_REST_SEC = 180

// Fallback per movement pattern (see generator.patternOf), used when no
// name rule below matches. `rom` is the distance the load travels (m),
// `body` the share of body weight that moves with it, `bw` the share when
// the move is done with body weight alone.
const PATTERN_MOTION = {
  squat: { rom: 0.5, body: 0.8, bw: 0.8 },
  hinge: { rom: 0.45, body: 0.5, bw: 0.5 },
  hpush: { rom: 0.4, body: 0.05, bw: 0.65 },
  vpush: { rom: 0.5, body: 0.08, bw: 0.9 },
  hpull: { rom: 0.4, body: 0.05, bw: 0.6 },
  vpull: { rom: 0.5, body: 0.05, bw: 1.0 },
  rear: { rom: 0.4, body: 0.02, bw: 0.1 },
  lateral: { rom: 0.4, body: 0.02, bw: 0.1 },
  shrug: { rom: 0.08, body: 0, bw: 0.1 },
  biceps: { rom: 0.35, body: 0.02, bw: 0.3 },
  triceps: { rom: 0.35, body: 0.02, bw: 0.65 },
  forearm: { rom: 0.08, body: 0, bw: 0.05 },
  core: { rom: 0.25, body: 0.3, bw: 0.3 },
  calf: { rom: 0.08, body: 1.0, bw: 1.0 },
  legother: { rom: 0.25, body: 0.05, bw: 0.3 },
  neck: { rom: 0.1, body: 0, bw: 0.05 },
}

// Name rules, first match wins. `body` here applies whether or not the move
// is loaded: a weighted pull-up still lifts all of you, a leg press none.
const NAME_MOTION = [
  // Lower body: what moves is the question.
  [/seated.*calf|calf press|calf.*leg press/i, { rom: 0.06, body: 0 }],
  [/calf|donkey/i, { rom: 0.08, body: 1.0 }],
  [/leg extension/i, { rom: 0.35, body: 0.06 }],
  [/ball leg curl|hamstring slides/i, { rom: 0.3, body: 0.35 }],
  [/leg curl|hamstring curl/i, { rom: 0.35, body: 0.06 }],
  [/glute[- ]ham/i, { rom: 0.5, body: 0.6 }],
  [/leg press/i, { rom: 0.45, body: 0.15 }],
  [/abduct|adduct/i, { rom: 0.25, body: 0.05 }],
  [/kickback/i, { rom: 0.3, body: 0.15 }],
  [/hip thrust|bridge|hip (raise|lift)|butt lift/i, { rom: 0.3, body: 0.55 }],
  [/pistol|one[- ]leg.*squat/i, { rom: 0.6, body: 0.85 }],
  [/step[- ]?up/i, { rom: 0.4, body: 1.0 }],
  [/lunge|split squat|bulgarian/i, { rom: 0.45, body: 0.8 }],
  [/squat/i, { rom: 0.5, body: 0.8 }],
  [/rack pull/i, { rom: 0.25, body: 0.4 }],
  [/good morning/i, { rom: 0.45, body: 0.55 }],
  [/romanian|stiff|deadlift/i, { rom: 0.5, body: 0.5 }],
  [/hyperextension|back extension|superman/i, { rom: 0.35, body: 0.5 }],
  [/swing/i, { rom: 0.6, body: 0.3 }],
  [/shrug/i, { rom: 0.08, body: 0 }],
  // Whole-body lifts: floor or hang to shoulders or overhead.
  [/snatch/i, { rom: 1.4, body: 0.5 }],
  [/thruster/i, { rom: 0.9, body: 0.8 }],
  [/clean.*(jerk|press)/i, { rom: 1.4, body: 0.6 }],
  [/clean|high pull/i, { rom: 1.0, body: 0.5 }],
  [/jerk|push press/i, { rom: 0.5, body: 0.3 }],
  [/get-?up/i, { rom: 1.0, body: 0.8 }],
  [/jump|hop|bound|leap|skip/i, { rom: 0.4, body: 1.0 }],
  // Body-weight upper body: the body is the load.
  [/muscle up/i, { rom: 1.0, body: 1.0 }],
  [/pull[- ]?ups?\b|chin|rope climb/i, { rom: 0.55, body: 1.0 }],
  [/inverted row|suspended row|bodyweight mid row/i, { rom: 0.35, body: 0.6 }],
  [/dip machine/i, { rom: 0.35, body: 0 }],
  [/bench dip/i, { rom: 0.35, body: 0.65 }],
  [/\bdips?\b/i, { rom: 0.4, body: 0.9 }],
  [/handstand/i, { rom: 0.35, body: 0.95 }],
  [/incline push-?up/i, { rom: 0.35, body: 0.5 }],
  [/push-?ups?.*(elevated|decline|ball)|decline push-?up/i, { rom: 0.35, body: 0.75 }],
  [/push[- ]?ups?\b/i, { rom: 0.35, body: 0.65 }],
  // Core: torso or legs are the load, any plate rides along.
  [/rollout|ab roller|fallout/i, { rom: 0.4, body: 0.5 }],
  [/(leg|knee|hip) raise|pike|leg pull-in|leg lift|flutter|scissor|toe touch/i, { rom: 0.4, body: 0.35 }],
  [/sit-?up/i, { rom: 0.3, body: 0.45 }],
  [/(machine|cable|rope).*crunch|crunch.*(machine|cable)/i, { rom: 0.15, body: 0.1 }],
  [/crunch|jackknife|v-up|tuck/i, { rom: 0.15, body: 0.35 }],
  [/twist|wood ?chop|side bend|pallof/i, { rom: 0.3, body: 0.1 }],
  // Upper body with an external load.
  [/pullover/i, { rom: 0.5, body: 0.02 }],
  [/wrist|finger|plate pinch/i, { rom: 0.08, body: 0 }],
  [/curl/i, { rom: 0.35, body: 0.02 }],
  [/(lateral|front|rear|delt|side|scaption).*raise|raise.*(lateral|front)|fly(e|es|s)?\b|crossover|pec deck|butterfly|pull apart/i, { rom: 0.45, body: 0.02 }],
  [/upright row/i, { rom: 0.4, body: 0.03 }],
]
const SINGLE_IMPLEMENT = /one[- ]arm|single[- ]arm|one[- ]hand|alternat|see-?saw|goblet|single dumbbell|plie|pullover|svend|seated triceps press|standing dumbbell triceps extension|calf raise on a dumbbell/i
const DOUBLE_IMPLEMENT = /double kettlebell|two-arm kettlebell|two kettlebells/i
const BODY_EQUIPMENT = new Set(['body only', 'other', 'bands', 'exercise ball', 'foam roll'])
const motionCache = new WeakMap()

/**
 * How one exercise moves: { rom, body, count, sides }. `count` is
 * how many of the logged weight are lifted at once (dumbbells are logged per
 * hand), `sides` how many times the logged reps happen (2 for one-sided
 * moves, logged per side). Cached per exercise object.
 */
export function motionOf(exercise) {
  if (!exercise) return { ...PATTERN_MOTION.hpush, count: 1, sides: 1 }
  let m = motionCache.get(exercise)
  if (m) return m
  const name = exercise.name || ''
  const rule = NAME_MOTION.find(([re]) => re.test(name))?.[1]
  let rom
  let body
  if (rule) ({ rom, body } = rule)
  else {
    const p = PATTERN_MOTION[exercise.sub ? patternOf(exercise) : 'hpush'] || PATTERN_MOTION.hpush
    rom = p.rom
    body = BODY_EQUIPMENT.has(exercise.equipment) ? p.bw : p.body
  }
  const single = SINGLE_IMPLEMENT.test(name)
  let count = 1
  if (exercise.equipment === 'dumbbell' && !single) count = 2
  if (exercise.equipment === 'kettlebells' && DOUBLE_IMPLEMENT.test(name)) count = 2
  const sides = UNILATERAL_NAME.test(name) ? 2 : 1
  m = { rom, body, count, sides }
  motionCache.set(exercise, m)
  return m
}

/** The most recent logged body weight in kg, or null if there is none. */
export function latestBodyKg(bodyLog = []) {
  if (!bodyLog.length) return null
  return [...bodyLog].sort((a, b) => a.date.localeCompare(b.date))[bodyLog.length - 1].weightKg
}

/** The weight assumed when none is logged: a moderate working load. */
function typicalLoad(exercise, bodyKg) {
  if (!exercise || BODY_EQUIPMENT.has(exercise.equipment)) return 0
  return bodyKg * (exercise.mechanic === 'compound' ? 0.4 : 0.12)
}

/**
 * Calories for one set from its reps (or seconds, for a hold) and weight.
 * Weight is per implement as logged (per dumbbell, the whole bar, the stack).
 * With no weight logged, a typical load is assumed.
 */
export function setKcal({ exercise, weightKg, reps, unit = 'reps', bodyKg }) {
  if (unit === 'sec') return (HOLD_MET * bodyKg * (reps || 30)) / 3600
  const m = motionOf(exercise)
  const load = (weightKg ?? typicalLoad(exercise, bodyKg)) * m.count
  const moved = load + bodyKg * m.body
  return (reps || 10) * m.sides * moved * m.rom * KCAL_PER_KG_M
}

/** Seconds one set takes, without the rest after it. */
function setSeconds(exercise, reps, unit) {
  if (unit === 'sec') return (reps || 30) + SET_OVERHEAD_SEC
  return (reps || 10) * SEC_PER_REP * motionOf(exercise).sides + SET_OVERHEAD_SEC
}

const timeKcal = (bodyKg, sec) => (BASE_MET * bodyKg * sec) / 3600

/**
 * Estimate for a planned workout. `items` are the generator's
 * { exerciseId, sets, repMin, repMax, unit } entries; `totalSec` is the
 * planned main-work duration (estimateSeconds without warm-up).
 * `weightFor(exerciseId)` gives the weight to assume (e.g. last time's),
 * or null for a typical load.
 */
export function plannedKcal(items, totalSec, bodyKg, { warmup = false, byId = {}, weightFor = () => null } = {}) {
  if (!items.some((it) => it.sets > 0)) return 0
  let total = timeKcal(bodyKg, totalSec)
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
 * weight of every done set, plus the time those sets take (work, the
 * planned rest after each, setup per exercise). That time is capped at the
 * real elapsed time, so a rushed session isn't padded. Returns null when no
 * sets are done yet.
 */
export function sessionKcal(session, exercisesById, bodyKg, now = Date.now()) {
  let sets = 0
  let work = 0
  let sec = 0
  for (const entry of session.entries) {
    if (entry.kind === 'cooldown') continue
    const exercise = exercisesById[entry.exerciseId]
    const rest = Math.min(entry.targetRestSec ?? DEFAULT_REST_SEC, MAX_REST_SEC)
    let done = 0
    for (const s of entry.sets) {
      if (!s.done) continue
      done += 1
      const reps = s.reps ?? entry.targetRepMax
      work += setKcal({ exercise, weightKg: s.weightKg, reps, unit: entry.targetUnit, bodyKg })
      sec += setSeconds(exercise, reps, entry.targetUnit) + rest
    }
    if (done) sec += SETUP_SEC - rest // no rest after the last set
    sets += done
  }
  if (sets === 0) return null
  const end = session.endedAt ? new Date(session.endedAt).getTime() : now
  const elapsedSec = Math.max(0, (end - new Date(session.startedAt).getTime()) / 1000)
  return Math.round(timeKcal(bodyKg, Math.min(sec, Math.max(elapsedSec, 60))) + work)
}
