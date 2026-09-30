// Random workout generator. Pure functions, no React, no side effects.
//
// The generator does not just shuffle exercises. It turns the chosen muscles
// into a per-sub-group "demand" (weighted by weekly targets, optionally
// skewed toward what you have under-trained lately), then greedily picks
// exercises whose `sub` weight vectors cover the demand that is still
// unmet -- so a chest day reaches upper, mid and lower chest, and a full-body
// day fills every movement pattern before adding accessories. Randomness is
// a seeded weighted draw among the best few candidates, so the same seed
// always reproduces the same workout.
import { SUBGROUPS, SUBGROUP_BY_ID, MAJORS } from './taxonomy.js'
import { volumeForEntries } from './coverage.js'
import { sessionsInWindow, sessionSetCounts } from './sessions.js'

// ------------------------------------------------------------- defaults

export const GENERATOR_LEVELS = ['beginner', 'intermediate', 'advanced']
export const GENERATOR_GOALS = ['strength', 'hypertrophy', 'endurance']

const FULL_BODY_MAJORS = ['chest', 'back', 'shoulders', 'arms', 'core', 'legs']

export const GENERATOR_DEFAULTS = {
  type: 'full', // 'full' | 'targeted'
  majors: FULL_BODY_MAJORS,
  excludeSubs: [],
  location: 'gym', // 'home' | 'gym'
  equipment: null, // null = resolved from the settings equipment profile by the caller
  hasBar: true, // a pull-up bar is available
  hasBench: true, // a bench is available
  level: 'intermediate',
  goal: 'hypertrophy',
  durationMin: 45, // null = no time limit
  moves: null, // null = derive from time
  favourUndertrained: false,
  warmup: true,
  supersets: false,
}

/** Merge the saved generator settings over the defaults (read-time
 *  defaulting, same idea as targetsWithDefaults -- nothing is migrated). */
export function generatorSettingsWithDefaults(saved, settings = {}) {
  const levelFromSettings = { beginner: 'beginner', intermediate: 'intermediate', expert: 'advanced' }[
    settings.maxLevel
  ]
  const merged = {
    ...GENERATOR_DEFAULTS,
    ...(levelFromSettings && !saved?.level ? { level: levelFromSettings } : {}),
    ...(saved || {}),
  }
  const validMajors = new Set(MAJORS.map((m) => m.id))
  merged.majors = (merged.majors || []).filter((m) => validMajors.has(m))
  merged.excludeSubs = (merged.excludeSubs || []).filter((g) => SUBGROUP_BY_ID[g])
  if (!GENERATOR_LEVELS.includes(merged.level)) merged.level = GENERATOR_DEFAULTS.level
  if (!GENERATOR_GOALS.includes(merged.goal)) merged.goal = GENERATOR_DEFAULTS.goal
  return merged
}

// ------------------------------------------------------ goal prescriptions

// Reps follow the load: heavy barbell/machine compounds sit lowest, other
// compounds (dumbbell, bodyweight, bands) a notch higher, isolation highest.
// Ranges are kept tight (about 2-4 reps wide) so each one is a clear target.
const PRESETS = {
  strength: {
    heavy: { reps: [4, 6], rest: 150, sets: 4 },
    comp: { reps: [6, 8], rest: 120, sets: 4 },
    iso: { reps: [8, 10], rest: 75, sets: 3 },
    minRest: 60,
  },
  hypertrophy: {
    heavy: { reps: [6, 8], rest: 120, sets: 3 },
    comp: { reps: [8, 12], rest: 90, sets: 3 },
    iso: { reps: [12, 15], rest: 60, sets: 3 },
    minRest: 45,
  },
  endurance: {
    heavy: { reps: [12, 15], rest: 60, sets: 3 },
    comp: { reps: [12, 15], rest: 45, sets: 3 },
    iso: { reps: [15, 20], rest: 30, sets: 3 },
    minRest: 20,
  },
}
const HEAVY_EQUIPMENT = new Set(['barbell', 'machine'])
// Holds are prescribed in seconds, not reps.
const ISOMETRIC_NAME = /plank|side bridge|wall sit|hollow hold|l-sit/i

const WORK_SEC = 40 // time under load per set, incl. a little fumbling
const SETUP_SEC = 60 // per exercise: walk over, set up, first-set prep
const WARMUP_SEC = 600 // 5 min warm-up + 5 min cooldown
const DEFAULT_DURATION_MIN = 45
const MIN_MOVES = 1
const MAX_MOVES = 14

// ------------------------------------------------------ exercise analysis

const LEVEL_RANK = { beginner: 0, intermediate: 1, expert: 2 }
const GEN_LEVEL_MAX = { beginner: 0, intermediate: 1, advanced: 2 }

const PATTERN_MAJOR = {
  squat: 'legs',
  hinge: 'legs',
  hpush: 'chest',
  vpush: 'shoulders',
  hpull: 'back',
  vpull: 'back',
  core: 'core',
  biceps: 'arms',
  triceps: 'arms',
}
// Order in which movement patterns claim a slot when there are fewer moves
// than patterns. Interleaves lower/upper and push/pull.
const PATTERN_PRIORITY = ['squat', 'hpush', 'hpull', 'core', 'hinge', 'vpush', 'vpull', 'biceps', 'triceps']

// The dataset has 876 entries, many of them obscure variations. Mainstream
// lifts get a score bonus so generated workouts read like a real program;
// the weighted draw still varies which ones show up.
export const STAPLES = new Set(`
Barbell_Bench_Press_-_Medium_Grip Barbell_Incline_Bench_Press_-_Medium_Grip Decline_Barbell_Bench_Press
Dumbbell_Bench_Press Incline_Dumbbell_Press Decline_Dumbbell_Bench_Press Dumbbell_Flyes Incline_Dumbbell_Flyes
Cable_Crossover Low_Cable_Crossover Cable_Chest_Press Incline_Cable_Chest_Press Machine_Bench_Press
Leverage_Chest_Press Leverage_Incline_Chest_Press Leverage_Decline_Chest_Press Butterfly Pushups Incline_Push-Up
Decline_Push-Up Dips_-_Chest_Version Smith_Machine_Bench_Press
Wide-Grip_Lat_Pulldown Close-Grip_Front_Lat_Pulldown Seated_Cable_Rows One-Arm_Dumbbell_Row T-Bar_Row_with_Handle
Bent_Over_Barbell_Row Pullups Chin-Up Face_Pull Reverse_Flyes Barbell_Shrug Dumbbell_Shrug
Hyperextensions_Back_Extensions Inverted_Row Leverage_Iso_Row Lying_T-Bar_Row Good_Morning
Barbell_Squat Barbell_Full_Squat Front_Squat_Clean_Grip Goblet_Squat Dumbbell_Squat Hack_Squat Leg_Press
Dumbbell_Lunges Barbell_Lunge Barbell_Walking_Lunge Split_Squat_with_Dumbbells Leg_Extensions Lying_Leg_Curls
Seated_Leg_Curl Standing_Leg_Curl Romanian_Deadlift Barbell_Deadlift Stiff-Legged_Barbell_Deadlift
Stiff-Legged_Dumbbell_Deadlift Sumo_Deadlift Barbell_Hip_Thrust Barbell_Glute_Bridge Single_Leg_Glute_Bridge
Standing_Calf_Raises Seated_Calf_Raise Standing_Dumbbell_Calf_Raise Bodyweight_Squat Smith_Machine_Squat
Trap_Bar_Deadlift Dumbbell_Rear_Lunge Bodyweight_Walking_Lunge
Standing_Military_Press Seated_Barbell_Military_Press Dumbbell_Shoulder_Press Arnold_Dumbbell_Press
Machine_Shoulder_Military_Press Side_Lateral_Raise Seated_Side_Lateral_Raise Cable_Seated_Lateral_Raise
Cable_Rear_Delt_Fly Seated_Bent-Over_Rear_Delt_Raise Leverage_Shoulder_Press Standing_Dumbbell_Upright_Row
Lateral_Raise_-_With_Bands Shoulder_Press_-_With_Bands
Barbell_Curl EZ-Bar_Curl Dumbbell_Bicep_Curl Dumbbell_Alternate_Bicep_Curl Hammer_Curls Incline_Dumbbell_Curl
Preacher_Curl Concentration_Curls Standing_Biceps_Cable_Curl Triceps_Pushdown Dips_-_Triceps_Version
EZ-Bar_Skullcrusher Standing_Dumbbell_Triceps_Extension Cable_Rope_Overhead_Triceps_Extension
Dumbbell_One-Arm_Triceps_Extension Tricep_Dumbbell_Kickback
Plank Crunches Hanging_Leg_Raise Cable_Crunch Russian_Twist Ab_Roller Reverse_Crunch Side_Bridge Dead_Bug
Oblique_Crunches Flat_Bench_Lying_Leg_Raise Decline_Crunch Exercise_Ball_Crunch
`.split(/\s+/).filter(Boolean))

const HEAVY_PATTERNS = new Set(['squat', 'hinge', 'hpush', 'vpush', 'hpull', 'vpull'])
const UPPER_PATTERNS = new Set(['hpush', 'vpush', 'hpull', 'vpull', 'rear', 'lateral', 'shrug', 'biceps', 'triceps', 'forearm'])
const LOWER_PATTERNS = new Set(['squat', 'hinge', 'calf', 'legother'])
const ANTAGONISTS = [
  ['hpush', 'hpull'],
  ['vpush', 'vpull'],
  ['hpush', 'vpull'],
  ['vpush', 'hpull'],
  ['biceps', 'triceps'],
  ['squat', 'hinge'],
]

// Dataset equipment tags don't cover a pull-up bar or a bench, so those two
// are inferred from the exercise name and gated by their own toggles.
const NEEDS_BAR = /pull-?ups?|chin-?ups?|\bchins?\b|muscle-?up|hanging|toes to bar|rope climb/i
const NEEDS_BENCH = /\bbench\b|incline|decline|preacher/i
const STANDARD_BODYWEIGHT = /pull-?ups?|chin-?ups?|\bdips?\b|push-?ups?|pushups|inverted row/i
const NO_BENCH_NEEDED = /push-?up|press-?up/i

function sumOf(sub, ids) {
  let t = 0
  for (const id of ids) t += sub[id] || 0
  return t
}

const SUBS_BY_MAJOR = (() => {
  const out = {}
  for (const s of SUBGROUPS) (out[s.major] ||= []).push(s.id)
  return out
})()

function topKey(map) {
  let best = null
  let bestV = -Infinity
  for (const [k, v] of Object.entries(map)) {
    if (v > bestV) {
      best = k
      bestV = v
    }
  }
  return best
}

/** Movement pattern of an exercise, derived from where its `sub` weight
 *  vector concentrates. */
export function patternOf(ex) {
  const sub = ex.sub || {}
  const majorSums = {}
  for (const m of MAJORS) majorSums[m.id] = sumOf(sub, SUBS_BY_MAJOR[m.id] || [])
  const top = topKey(majorSums)
  switch (top) {
    case 'chest':
      return 'hpush'
    case 'shoulders': {
      const rear = (sub.delt_post || 0) + (sub.cuff || 0)
      const front = sub.delt_ant || 0
      const side = sub.delt_lat || 0
      if (rear > front && rear > side) return 'rear'
      if (side > front) return 'lateral'
      return 'vpush'
    }
    case 'back': {
      const erector = sub.erector || 0
      const others = Math.max(sub.lat || 0, sub.rhomboid || 0, sub.trap_upper || 0, sub.trap_mid || 0)
      if (erector > others) return 'hinge'
      const rows = sumOf(sub, ['rhomboid', 'trap_mid', 'trap_lower', 'teres', 'delt_post'])
      if ((sub.trap_upper || 0) > (sub.lat || 0) && (sub.trap_upper || 0) > rows) return 'shrug'
      return (sub.lat || 0) >= rows ? 'vpull' : 'hpull'
    }
    case 'arms': {
      const bi = sumOf(sub, ['bicep_long', 'bicep_short', 'brachialis'])
      const tri = sumOf(sub, ['tricep_long', 'tricep_lat', 'tricep_med'])
      const fore = sumOf(sub, ['forearm_flex', 'forearm_ext', 'grip'])
      if (fore > bi && fore > tri) return 'forearm'
      return bi >= tri ? 'biceps' : 'triceps'
    }
    case 'core':
      return 'core'
    case 'legs': {
      const quad = sumOf(sub, ['quad_rf', 'quad_vl', 'quad_vm'])
      const hip = sumOf(sub, ['ham_bf', 'ham_med', 'glute_max'])
      const calf = sumOf(sub, ['calf_gastroc', 'calf_soleus'])
      const other = sumOf(sub, ['glute_med', 'adductor', 'hip_flexor', 'tibialis'])
      const best = Math.max(quad, hip, calf, other)
      if (best === quad) return 'squat'
      if (best === hip) return 'hinge'
      if (best === calf) return 'calf'
      return 'legother'
    }
    default:
      return 'neck'
  }
}

// The dataset tags some single-joint moves (flyes, raises, curls...) as
// compound; the name is the more reliable signal.
const ISOLATION_NAME = /\bfly(e|es|s)?\b|crossover|butterfly|pullover|raises?\b|curls?\b|extensions?\b|kickbacks?|shrugs?|iron cross|pushdown|wrist|pec deck/i

function isCompound(ex, pattern) {
  if (ISOLATION_NAME.test(ex.name)) return false
  if (ex.mechanic === 'compound') return true
  if (ex.mechanic === 'isolation') return false
  return HEAVY_PATTERNS.has(pattern)
}

const EQUIPMENT_WORDS = new Set([
  'barbell', 'dumbbell', 'dumbbells', 'cable', 'machine', 'smith', 'ez', 'bar', 'kettlebell', 'kettlebells',
  'band', 'bands', 'one', 'arm', 'single', 'alternating', 'with', 'the', 'a', 'on', 'and', 'to', 'of',
])

function nameTokens(name) {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t && !EQUIPMENT_WORDS.has(t)),
  )
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter += 1
  return inter / (a.size + b.size - inter)
}

function fractionVector(sub) {
  const total = Object.values(sub || {}).reduce((s, v) => s + v, 0)
  if (total <= 0) return {}
  const out = {}
  for (const [g, w] of Object.entries(sub)) out[g] = w / total
  return out
}

function describe(ex) {
  const sub = ex.sub || {}
  const frac = fractionVector(sub)
  const pattern = patternOf(ex)
  const majorFrac = {}
  for (const [g, f] of Object.entries(frac)) {
    const m = SUBGROUP_BY_ID[g]?.major
    if (m) majorFrac[m] = (majorFrac[m] || 0) + f
  }
  return {
    ex,
    frac,
    pattern,
    topSub: topKey(sub),
    topMajor: topKey(majorFrac),
    majorFrac,
    compound: isCompound(ex, pattern),
    tokens: nameTokens(ex.name),
  }
}

// ---------------------------------------------------------------- pool

function equipmentOk(ex, params) {
  const have = new Set(params.equipment || [])
  if (!have.has(ex.equipment)) return false
  if (
    !params.hasBar &&
    (ex.equipment === 'body only' || ex.equipment === 'other' || ex.equipment === 'bands') &&
    NEEDS_BAR.test(ex.name) &&
    !/scapular/i.test(ex.name)
  ) {
    return false
  }
  if (!params.hasBench && ex.equipment !== 'machine' && NEEDS_BENCH.test(ex.name) && !NO_BENCH_NEEDED.test(ex.name)) {
    return false
  }
  return true
}

function buildPool(exercises, params) {
  const maxRank = GEN_LEVEL_MAX[params.level] ?? 1
  const advanced = params.level === 'advanced'
  const categories = new Set(['strength', 'powerlifting'])
  if (advanced) categories.add('olympic weightlifting')
  if (advanced || params.goal === 'endurance') categories.add('plyometrics')

  const out = []
  for (const ex of exercises) {
    if (!ex.sub) continue
    if (!categories.has(ex.category)) continue
    if ((LEVEL_RANK[ex.level] ?? 2) > maxRank) continue
    if (!equipmentOk(ex, params)) continue
    out.push(describe(ex))
  }
  return out
}

// ----------------------------------------------------------- randomness

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Weighted draw among the best few scored candidates: near-ties vary from
 *  run to run, clear winners still win. `scored` is [{ meta, score }]. */
function pickWeighted(scored, rng, { k = 5, temperature = 0.12 } = {}) {
  if (scored.length === 0) return null
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, k)
  const best = top[0].score
  const weights = top.map((c) => Math.exp((c.score - best) / temperature))
  const total = weights.reduce((s, w) => s + w, 0)
  let r = rng() * total
  for (let i = 0; i < top.length; i++) {
    r -= weights[i]
    if (r <= 0) return top[i].meta
  }
  return top[top.length - 1].meta
}

// ------------------------------------------------------ context + demand

/**
 * Everything the generator needs to know about the user beyond the form:
 * weekly targets (how much each sub-group matters), what was trained in the
 * last 7 days / 48 hours, favourites, and the last session's exercises.
 */
export function buildContext({ exercises, targets, sessions = [], favorites = [], creditMode = 'peak' }) {
  const byId = Object.fromEntries(exercises.map((e) => [e.id, e]))
  const finished = sessions.filter((s) => s.endedAt)
  const volumeIn = (days) =>
    volumeForEntries(sessionSetCounts(sessionsInWindow(finished, days)), byId, creditMode)
  const last = [...finished].sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))[0]
  return {
    exercises,
    byId,
    targets,
    recentVolume: volumeIn(7),
    recoveryVolume: volumeIn(2),
    favorites: new Set(favorites),
    lastIds: new Set(last ? last.entries.map((e) => e.exerciseId) : []),
  }
}

function setup(params, ctx) {
  const majors = new Set(params.majors)
  const excluded = new Set(params.excludeSubs || [])
  const scopeSubs = SUBGROUPS.filter((s) => majors.has(s.major) && !excluded.has(s.id))
  const scope = new Set(scopeSubs.map((s) => s.id))

  const demand = {}
  let total = 0
  for (const s of scopeSubs) {
    const t = ctx.targets?.[s.id]
    const importance = t ? (t[0] + t[1]) / 2 : 6
    let need = 1
    if (params.favourUndertrained) {
      const mid = t ? (t[0] + t[1]) / 2 : 6
      const ratio = (ctx.recentVolume?.[s.id] || 0) / mid
      need = Math.min(1.3, Math.max(0.3, 1.3 - ratio))
      if ((ctx.recoveryVolume?.[s.id] || 0) >= 3) need *= 0.5
    }
    demand[s.id] = importance * need
    total += demand[s.id]
  }
  if (total > 0) for (const g of Object.keys(demand)) demand[g] /= total

  const pool = buildPool(ctx.exercises, params).filter((m) => {
    if (!majors.has(m.topMajor)) return false
    if (excluded.has(m.topSub)) return false
    let inScope = 0
    for (const [g, f] of Object.entries(m.frac)) if (scope.has(g)) inScope += f
    return inScope >= 0.5
  })
  return { majors, excluded, scope, demand, pool }
}

// ------------------------------------------------------------- scoring

function scoreCandidate(meta, st, ctx, position, total, goal) {
  const { scope, demand, remaining, covered, chosen } = st
  let rmax = 0
  for (const g of scope) rmax = Math.max(rmax, remaining[g])
  if (rmax <= 0) rmax = 1

  let useful = 0
  let uncovered = 0
  let inScope = 0
  for (const [g, f] of Object.entries(meta.frac)) {
    if (!scope.has(g)) continue
    inScope += f
    useful += f * Math.min(1, Math.max(-0.3, remaining[g] / rmax))
    if (covered[g] < 0.2 && demand[g] > 0) uncovered += Math.min(f, 0.6)
  }
  // Judge how well the in-scope part of the exercise lines up with the unmet
  // demand, so a press isn't marked down for its triceps and front-delt share.
  let score = useful / Math.max(inScope, 0.5) + 0.3 * uncovered - 0.1 * (1 - inScope)

  const early = position < Math.ceil(total / 2)
  if (meta.compound) score += early ? (goal === 'strength' ? 0.35 : 0.25) : 0.05
  else if (!early) score += goal === 'hypertrophy' ? 0.15 : 0.1

  let dup = 0
  for (const c of chosen) {
    if (c.pattern === meta.pattern && c.topSub === meta.topSub) dup += 0.5
    if (jaccard(c.tokens, meta.tokens) >= 0.6) dup += 0.8
  }
  score -= Math.min(dup, 1.5)

  if (STAPLES.has(meta.ex.id)) score += 0.3
  if (meta.ex.conf === 'med') score -= 0.05
  if (ctx.favorites?.has(meta.ex.id)) score += 0.1
  if (ctx.lastIds?.has(meta.ex.id)) score -= 0.25
  if (st.intermediateUp && meta.ex.level !== 'beginner') score += 0.1
  // In a gym, loaded work beats improvised bodyweight/band versions -- except
  // where bodyweight is the standard tool (core, pull-ups).
  if (st.gym && !STANDARD_BODYWEIGHT.test(meta.ex.name) && meta.pattern !== 'core') {
    if (['body only', 'bands', 'other', 'exercise ball', 'medicine ball', 'foam roll'].includes(meta.ex.equipment)) score -= 0.2
  }
  return score
}

function registerPick(st, meta) {
  st.chosen.push(meta)
  for (const [g, f] of Object.entries(meta.frac)) {
    if (!st.scope.has(g)) continue
    st.covered[g] += f
    st.remaining[g] -= f
  }
}

function newPickState(params, sp, n) {
  const covered = {}
  const remaining = {}
  for (const g of sp.scope) {
    covered[g] = 0
    remaining[g] = sp.demand[g] * n
  }
  return {
    scope: sp.scope,
    demand: sp.demand,
    remaining,
    covered,
    chosen: [],
    intermediateUp: params.level !== 'beginner',
    gym: params.location === 'gym',
  }
}

// ---------------------------------------------------- prescription + time

function prescribe(meta, params, index = 0) {
  const preset = PRESETS[params.goal] || PRESETS.hypertrophy
  const kind = !meta.compound ? 'iso' : HEAVY_EQUIPMENT.has(meta.ex.equipment) ? 'heavy' : 'comp'
  const base = preset[kind]
  let sets = base.sets
  if (params.level === 'beginner') sets = kind === 'iso' ? Math.min(sets, 2) : Math.min(sets, 3)
  else if (params.level === 'advanced' && kind !== 'iso' && index < 3) sets = Math.min(5, sets + 1)
  let [repMin, repMax] = base.reps
  if (params.level === 'beginner' && params.goal === 'strength' && kind === 'heavy') [repMin, repMax] = [5, 8]
  let restSec = base.rest
  let unit = 'reps'
  if (meta.pattern === 'core' || meta.pattern === 'calf') {
    ;[repMin, repMax] = params.goal === 'endurance' ? [15, 20] : [12, 15]
    restSec = Math.min(restSec, 60)
  }
  if (ISOMETRIC_NAME.test(meta.ex.name)) {
    ;[repMin, repMax] = [30, 45]
    restSec = Math.min(restSec, 45)
    unit = 'sec'
  }
  return { exerciseId: meta.ex.id, sets, repMin, repMax, unit, restSec, pairId: null, pattern: meta.pattern, compound: meta.compound }
}

/** Estimated session length in seconds: per set, work plus rest (the last
 *  rest of an exercise is skipped), plus setup. A superset pair shares its
 *  rest between both moves. */
export function estimateSeconds(items, { warmup = false } = {}) {
  let t = 0
  const seen = new Set()
  for (const it of items) {
    if (seen.has(it)) continue
    seen.add(it)
    const partner = it.pairId ? items.find((o) => o !== it && o.pairId === it.pairId) : null
    if (partner) {
      seen.add(partner)
      const s = Math.min(it.sets, partner.sets)
      const rest = Math.max(it.restSec, partner.restSec)
      t += s * (WORK_SEC * 2 + rest) - rest + SETUP_SEC * 1.5
    } else {
      t += it.sets * (WORK_SEC + it.restSec) - it.restSec + SETUP_SEC
    }
  }
  return t + (warmup ? WARMUP_SEC : 0)
}

function movesFromTime(durationMin, params) {
  const preset = PRESETS[params.goal] || PRESETS.hypertrophy
  const restSec = (preset.comp.rest + preset.iso.rest) / 2
  const perExercise = preset.comp.sets * (WORK_SEC + restSec) - restSec + SETUP_SEC
  const budget = durationMin * 60 - (params.warmup ? WARMUP_SEC : 0)
  const n = Math.round((budget / perExercise) * (params.supersets ? 1.25 : 1))
  return Math.min(MAX_MOVES, Math.max(3, n))
}

function compatible(a, b, goal) {
  if (a.pattern === b.pattern) return false
  if (goal === 'strength' && a.compound && b.compound) return false
  if (a.compound && b.compound && (LOWER_PATTERNS.has(a.pattern) || LOWER_PATTERNS.has(b.pattern))) return false
  if (ANTAGONISTS.some(([x, y]) => (a.pattern === x && b.pattern === y) || (a.pattern === y && b.pattern === x))) return true
  if ((UPPER_PATTERNS.has(a.pattern) && LOWER_PATTERNS.has(b.pattern)) || (UPPER_PATTERNS.has(b.pattern) && LOWER_PATTERNS.has(a.pattern))) return true
  if (a.pattern === 'core' || b.pattern === 'core' || a.pattern === 'calf' || b.pattern === 'calf') return true
  return false
}

/** Fit the plan to a time budget. Too long: trim sets to a comfortable
 *  floor, shorten rests, pair supersets, then trim sets further. Too short:
 *  add sets (compounds first). Returns { items, overBudget }. */
function fitToTime(items, budgetSec, params) {
  const preset = PRESETS[params.goal] || PRESETS.hypertrophy
  const est = () => estimateSeconds(items)
  const floorA = (it) => (it.compound ? 3 : 2)

  const shrinkSets = (floorOf) => {
    while (est() > budgetSec) {
      let pick = null
      for (let i = items.length - 1; i >= 0; i--) {
        const room = items[i].sets - floorOf(items[i])
        if (room > 0 && (!pick || room > pick.room)) pick = { it: items[i], room }
      }
      if (!pick) break
      pick.it.sets -= 1
    }
  }

  const shrinkRest = () => {
    while (est() > budgetSec) {
      let changed = false
      for (const it of items) {
        const next = Math.max(preset.minRest, it.restSec - 10)
        if (next < it.restSec) {
          it.restSec = next
          changed = true
        }
        if (est() <= budgetSec) break
      }
      if (!changed) break
    }
  }

  const pairUp = () => {
    let nextId = 0
    for (let i = 0; i < items.length && est() > budgetSec; i++) {
      const a = items[i]
      if (a.pairId) continue
      const j = items.findIndex((b, k) => k > i && !b.pairId && compatible(a, b, params.goal))
      if (j < 0) continue
      const b = items[j]
      const id = String.fromCharCode(65 + nextId++)
      a.pairId = id
      b.pairId = id
      const sets = Math.min(a.sets, b.sets)
      a.sets = sets
      b.sets = sets
      items.splice(j, 1)
      items.splice(i + 1, 0, b)
    }
  }

  if (est() > budgetSec) {
    shrinkSets(floorA)
    shrinkRest()
    if (params.supersets) pairUp()
    shrinkSets(() => 2)
    return { items, overBudget: est() > budgetSec }
  }

  // Under budget: grow volume toward it, compounds first, one set at a time.
  const cap = (it) => (params.level === 'beginner' ? (it.compound ? 4 : 3) : it.compound ? 5 : 4)
  let grew = true
  while (grew) {
    grew = false
    for (const it of [...items].sort((a, b) => Number(b.compound) - Number(a.compound))) {
      if (it.sets >= cap(it)) continue
      it.sets += 1
      if (est() > budgetSec) {
        it.sets -= 1
      } else {
        grew = true
      }
    }
  }
  return { items, overBudget: false }
}

// ------------------------------------------------ warm-up, cool-down, text

function pickCooldown(ctx, params, chosen, rng, count) {
  const have = new Set(params.equipment || [])
  const coverage = {}
  for (const m of chosen) for (const [g, f] of Object.entries(m.frac)) coverage[g] = (coverage[g] || 0) + f
  const stretches = ctx.exercises
    .filter(
      (e) =>
        e.category === 'stretching' &&
        e.sub &&
        (e.equipment === 'body only' || e.equipment === 'other' || have.has(e.equipment)),
    )
    .map(describe)

  const out = []
  const picked = new Set()
  const left = { ...coverage }
  for (let i = 0; i < count; i++) {
    const scored = []
    for (const m of stretches) {
      if (picked.has(m.ex.id)) continue
      let s = 0
      for (const [g, f] of Object.entries(m.frac)) s += f * (left[g] || 0)
      if (s <= 0) continue
      if (out.some((o) => jaccard(o.tokens, m.tokens) >= 0.6)) s *= 0.3
      scored.push({ meta: m, score: s })
    }
    const pick = pickWeighted(scored, rng, { k: 3, temperature: 0.15 })
    if (!pick) break
    picked.add(pick.ex.id)
    out.push(pick)
    for (const g of Object.keys(pick.frac)) left[g] = (left[g] || 0) * 0.3
  }
  return out.map((m) => ({ exerciseId: m.ex.id, holdSec: 30, name: m.ex.name }))
}

function topMuscleNames(chosen, n = 3) {
  const totals = {}
  for (const m of chosen) for (const [g, f] of Object.entries(m.majorFrac)) totals[g] = (totals[g] || 0) + f
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => (MAJORS.find((m) => m.id === id)?.name ?? id).toLowerCase())
}

function workoutName(params) {
  const goal = params.goal[0].toUpperCase() + params.goal.slice(1)
  const allMajors = params.majors.length >= FULL_BODY_MAJORS.length
  const label =
    params.type === 'full' && allMajors
      ? 'Full body'
      : params.majors.map((id) => MAJORS.find((m) => m.id === id)?.name ?? id).join(' + ')
  return `${label} · ${goal}`
}

function buildNotes(items, cooldown, chosenMetas, params, ctx) {
  let warmupNote = ''
  if (params.warmup) {
    const muscles = topMuscleNames(chosenMetas).join(', ')
    const first = items.find((it) => it.compound) || items[0]
    const firstEx = first && ctx.byId[first.exerciseId]
    const ramp =
      firstEx && firstEx.equipment !== 'body only'
        ? ` Before ${firstEx.name}, do 1-2 light ramp-up sets at about 50% of your working weight.`
        : firstEx
          ? ` Before ${firstEx.name}, do a few easy reps to groove the movement.`
          : ''
    warmupNote = `Warm-up (~5 min): light cardio, then dynamic mobility for ${muscles}.${ramp}`
  }
  const cooldownNote =
    params.warmup && cooldown.length
      ? `Cooldown: ${cooldown.map((c) => `${c.name} (${c.holdSec}s)`).join(', ')}.`
      : ''
  return { warmupNote, cooldownNote }
}

function timeWarnings(items, params) {
  const warnings = []
  if (params.durationMin) {
    const est = estimateSeconds(items, { warmup: params.warmup })
    if (est > params.durationMin * 60 * 1.05) {
      warnings.push({
        kind: 'time',
        text: `Estimated ${Math.round(est / 60)} min, over your ${params.durationMin} min limit. Reduce the number of moves or raise the time.`,
      })
    }
  }
  return warnings
}

// --------------------------------------------------------------- generate

/** The slots to fill first: one per movement pattern whose major is in
 *  scope, in priority order. Fewer moves than patterns just truncates. */
function patternSpecs(majors) {
  return PATTERN_PRIORITY.filter((p) => majors.has(PATTERN_MAJOR[p]))
}

/**
 * Generate a workout. `params` is the form (see GENERATOR_DEFAULTS with
 * `equipment` resolved to an array); `ctx` comes from buildContext; `seed`
 * makes the result reproducible.
 *
 * Returns { seed, params, name, items, cooldown, warmupNote, cooldownNote,
 * estMin, warnings, unreachable }. `items` are
 * { exerciseId, sets, repMin, repMax, restSec, pairId, pattern, compound }.
 */
export function generateWorkout(params, ctx, seed) {
  const rng = mulberry32(seed)
  const warnings = []
  const base = { seed, params, name: workoutName(params) }

  if (params.majors.length === 0) {
    return { ...base, items: [], cooldown: [], warmupNote: '', cooldownNote: '', estMin: 0, unreachable: [], warnings: [{ kind: 'empty', text: 'Pick at least one muscle group.' }] }
  }

  const sp = setup(params, ctx)

  // Move count: explicit, else derived from time (default 45 min).
  const durationMin = params.durationMin ?? (params.moves ? null : DEFAULT_DURATION_MIN)
  const requested = params.moves
    ? Math.min(MAX_MOVES, Math.max(MIN_MOVES, Math.round(params.moves)))
    : movesFromTime(durationMin, params)
  const n = Math.min(requested, sp.pool.length)
  if (n < requested) {
    warnings.push({
      kind: 'few',
      text: `Only ${sp.pool.length} suitable exercise${sp.pool.length === 1 ? '' : 's'} found for this equipment and level, so the workout has ${n} move${n === 1 ? '' : 's'}.`,
    })
  }
  if (sp.pool.length === 0) {
    return { ...base, items: [], cooldown: [], warmupNote: '', cooldownNote: '', estMin: 0, unreachable: [...sp.scope], warnings: [{ kind: 'empty', text: 'No exercises match this equipment, level and muscle selection.' }] }
  }

  const st = newPickState(params, sp, n)
  const taken = () => new Set(st.chosen.map((c) => c.ex.id))

  // Phase 1: one exercise per movement pattern (full coverage of the body's
  // basic patterns before any accessory work).
  for (const pattern of patternSpecs(sp.majors)) {
    if (st.chosen.length >= n) break
    const ids = taken()
    // The basic patterns are filled with compound lifts; isolation work
    // only qualifies when no compound exists for this equipment/level.
    const ofPattern = sp.pool.filter((m) => m.pattern === pattern && !ids.has(m.ex.id))
    const compounds = ofPattern.filter((m) => m.compound)
    const scored = (compounds.length ? compounds : ofPattern).map((m) => ({
      meta: m,
      score: scoreCandidate(m, st, ctx, st.chosen.length, n, params.goal),
    }))
    const pick = pickWeighted(scored, rng)
    if (pick) registerPick(st, pick)
  }

  // Phase 2: fill the remaining slots with whatever covers the most unmet
  // sub-group demand.
  while (st.chosen.length < n) {
    const ids = taken()
    const scored = sp.pool
      .filter((m) => !ids.has(m.ex.id))
      .map((m) => ({ meta: m, score: scoreCandidate(m, st, ctx, st.chosen.length, n, params.goal) }))
    const pick = pickWeighted(scored, rng)
    if (!pick) break
    registerPick(st, pick)
  }

  // Order: compounds first, isolation next, core last.
  const group = (m) => (m.pattern === 'core' ? 2 : m.compound ? 0 : 1)
  const ordered = st.chosen
    .map((m, i) => ({ m, i }))
    .sort((a, b) => group(a.m) - group(b.m) || a.i - b.i)
    .map((x) => x.m)

  let items = ordered.map((m, i) => prescribe(m, params, i))

  if (durationMin) {
    const budget = durationMin * 60 - (params.warmup ? WARMUP_SEC : 0)
    const fit = fitToTime(items, budget, params)
    items = fit.items
  }
  warnings.push(...timeWarnings(items, { ...params, durationMin }))

  // Gaps: sub-groups in scope that no pool exercise reaches meaningfully.
  const unreachable = [...sp.scope].filter((g) => !sp.pool.some((m) => (m.frac[g] || 0) >= 0.12))

  for (const major of sp.majors) {
    if (!sp.pool.some((m) => m.topMajor === major)) {
      warnings.push({
        kind: 'major',
        text: `No ${MAJORS.find((m) => m.id === major)?.name ?? major} exercises match this equipment and level.`,
      })
    }
  }

  const cooldown = params.warmup ? pickCooldown(ctx, params, st.chosen, rng, n <= 3 ? 2 : n <= 6 ? 3 : 4) : []
  const { warmupNote, cooldownNote } = buildNotes(items, cooldown, st.chosen, params, ctx)

  return {
    ...base,
    items,
    cooldown,
    warmupNote,
    cooldownNote,
    estMin: Math.round(estimateSeconds(items, { warmup: params.warmup }) / 60),
    warnings,
    unreachable,
  }
}

/**
 * Replace one exercise in a generated workout with another that does a
 * similar job (same movement pattern preferred), given the rest of the
 * workout's coverage. Returns a new workout, or the same one if nothing
 * else fits.
 */
export function swapExercise(workout, index, ctx, seed) {
  const { params } = workout
  const rng = mulberry32(seed)
  const sp = setup(params, ctx)
  const old = workout.items[index]
  if (!old) return workout

  const metaById = new Map(sp.pool.map((m) => [m.ex.id, m]))
  const others = workout.items.filter((_, i) => i !== index)
  const st = newPickState(params, sp, workout.items.length)
  for (const it of others) {
    const m = metaById.get(it.exerciseId) || (ctx.byId[it.exerciseId] && describe(ctx.byId[it.exerciseId]))
    if (m) registerPick(st, m)
  }

  const ids = new Set(workout.items.map((it) => it.exerciseId))
  const scored = sp.pool
    .filter((m) => !ids.has(m.ex.id))
    .map((m) => ({
      meta: m,
      score: scoreCandidate(m, st, ctx, index, workout.items.length, params.goal) + (m.pattern === old.pattern ? 0.4 : 0) +
        (m.compound === old.compound ? 0.3 : 0),
    }))
  const pick = pickWeighted(scored, rng)
  if (!pick) return workout

  // A swapped move can break a superset's compatibility, so unpair it.
  const items = workout.items.map((it) => ({ ...it }))
  if (old.pairId) for (const it of items) if (it.pairId === old.pairId) it.pairId = null
  const fresh = prescribe(pick, params, index)
  items[index] = { ...fresh, sets: old.sets }

  return {
    ...workout,
    items,
    estMin: Math.round(estimateSeconds(items, { warmup: params.warmup }) / 60),
    warnings: [...workout.warnings.filter((w) => w.kind !== 'time'), ...timeWarnings(items, params)],
  }
}
