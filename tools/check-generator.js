// Standalone sanity check for src/lib/generator.js. Run: node tools/check-generator.js
// (-v prints a few sample workouts). Exits non-zero on any failed assertion.
//
// The app imports JSON without import attributes (Vite allows it, Node does
// not), so a tiny loader hook turns .json into ES modules first.
import { register } from 'node:module'

register(
  'data:text/javascript,' +
    encodeURIComponent(`
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
export async function load(url, context, next) {
  if (url.endsWith('.json')) {
    const text = await readFile(fileURLToPath(url), 'utf8')
    return { format: 'module', source: 'export default ' + text, shortCircuit: true }
  }
  return next(url, context)
}`),
  import.meta.url,
)

const { readFileSync } = await import('node:fs')
const gen = await import('../src/lib/generator.js')
const { DEFAULT_TARGETS } = await import('../src/lib/constants.js')
const { SUBGROUP_BY_ID } = await import('../src/lib/taxonomy.js')

const exercises = JSON.parse(readFileSync(new URL('../src/data/exercises.json', import.meta.url), 'utf8'))
const ctx = gen.buildContext({ exercises, targets: DEFAULT_TARGETS })
for (const id of gen.STAPLES) if (!ctx.byId[id]) console.warn('unknown staple id:', id)
const verbose = process.argv.includes('-v')

const HOME = ['body only', 'dumbbell', 'bands', 'exercise ball']
const GYM = ['barbell', 'dumbbell', 'cable', 'machine', 'body only', 'kettlebells', 'e-z curl bar', 'bands', 'medicine ball', 'other']
const LEVEL_RANK = { beginner: 0, intermediate: 1, expert: 2 }
const LEVEL_MAX = { beginner: 0, intermediate: 1, advanced: 2 }

let failures = 0
let runs = 0
function check(ok, msg) {
  if (!ok) {
    failures += 1
    if (failures <= 25) console.error('FAIL:', msg)
  }
}

function base(over) {
  return { ...gen.GENERATOR_DEFAULTS, ...over }
}

const ALL_MAJORS = ['chest', 'back', 'shoulders', 'arms', 'core', 'legs']
const scenarios = []
for (const location of ['home', 'gym']) {
  for (const level of gen.GENERATOR_LEVELS) {
    for (const goal of gen.GENERATOR_GOALS) {
      const common = {
        location,
        level,
        goal,
        equipment: location === 'home' ? HOME : GYM,
        hasBar: location === 'gym',
        hasBench: location === 'gym',
      }
      for (const [durationMin, moves] of [[45, null], [null, 6], [30, 7], [20, 4], [60, 9], [null, null], [15, 8]]) {
        scenarios.push(base({ ...common, type: 'full', majors: ALL_MAJORS, durationMin, moves }))
        for (const major of ALL_MAJORS) {
          scenarios.push(base({ ...common, type: 'targeted', majors: [major], durationMin, moves, supersets: true }))
        }
        scenarios.push(base({ ...common, type: 'targeted', majors: ['chest', 'arms'], durationMin, moves, favourUndertrained: true }))
      }
    }
  }
}

for (const params of scenarios) {
  for (const seed of [1, 2]) {
    runs += 1
    const w = gen.generateWorkout(params, ctx, seed)
    const tag = `${params.location}/${params.level}/${params.goal}/${params.type}:${params.majors.join('+')}/t${params.durationMin}/m${params.moves}/s${seed}`
    const again = seed === 1 ? gen.generateWorkout(params, ctx, seed) : w
    check(JSON.stringify(again.items) === JSON.stringify(w.items), `${tag}: not deterministic`)

    const ids = w.items.map((i) => i.exerciseId)
    check(new Set(ids).size === ids.length, `${tag}: duplicate exercise`)
    const equip = new Set(params.equipment)
    for (const id of ids) {
      const ex = ctx.byId[id]
      check(equip.has(ex.equipment), `${tag}: ${ex.name} needs ${ex.equipment}`)
      check(LEVEL_RANK[ex.level] <= LEVEL_MAX[params.level], `${tag}: ${ex.name} is ${ex.level}`)
      check(!['stretching', 'cardio', 'strongman'].includes(ex.category), `${tag}: ${ex.name} category ${ex.category}`)
      if (!params.hasBar) check(!/pull-?up|chin-?up/i.test(ex.name) || /scapular/i.test(ex.name), `${tag}: ${ex.name} needs a bar`)
      const majors = new Set(params.majors)
      const byMajor = {}
      for (const [g, v] of Object.entries(ex.sub)) byMajor[SUBGROUP_BY_ID[g].major] = (byMajor[SUBGROUP_BY_ID[g].major] || 0) + v
      const top = Object.entries(byMajor).sort((a, b) => b[1] - a[1])[0][0]
      check(majors.has(top), `${tag}: ${ex.name} is off-target (${top})`)
    }
    if (params.moves) {
      const want = Math.min(params.moves, 14)
      check(ids.length === want || w.warnings.some((x) => x.kind === 'few'), `${tag}: expected ${want} moves, got ${ids.length}`)
    }
    const limit = params.durationMin ?? (params.moves ? null : 45)
    if (limit && ids.length) {
      const est = gen.estimateSeconds(w.items, { warmup: params.warmup }) / 60
      check(est <= limit * 1.05 || w.warnings.some((x) => x.kind === 'time'), `${tag}: ${est.toFixed(0)} min over ${limit} with no warning`)
    }
    for (const it of w.items) {
      check(it.sets >= 1 && it.repMin <= it.repMax && it.restSec > 0, `${tag}: bad prescription ${JSON.stringify(it)}`)
      if (it.pairId) check(w.items.filter((o) => o.pairId === it.pairId).length === 2, `${tag}: orphan superset ${it.pairId}`)
    }
  }
}

// Coverage expectations.
const subsOf = (w) => {
  const covered = {}
  for (const it of w.items) for (const [g, v] of Object.entries(ctx.byId[it.exerciseId].sub)) covered[g] = (covered[g] || 0) + v
  return covered
}
const patternsOf = (w) => new Set(w.items.map((i) => i.pattern))

for (const loc of ['gym', 'home']) {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const p = base({ location: loc, equipment: loc === 'home' ? HOME : GYM, hasBar: loc === 'gym', hasBench: loc === 'gym', majors: ALL_MAJORS, durationMin: null, moves: 9 })
    const w = gen.generateWorkout(p, ctx, seed)
    const pats = patternsOf(w)
    const want = loc === 'gym' ? ['squat', 'hinge', 'hpush', 'vpush', 'hpull', 'vpull', 'core'] : ['squat', 'hinge', 'hpush', 'hpull', 'core']
    for (const pat of want) check(pats.has(pat), `${loc} full-body seed ${seed}: missing ${pat} (${[...pats]})`)
    const majorsHit = new Set(Object.keys(subsOf(w)).map((g) => SUBGROUP_BY_ID[g].major))
    for (const m of ['chest', 'back', 'shoulders', 'arms', 'core', 'legs']) check(majorsHit.has(m), `${loc} full-body seed ${seed}: ${m} untouched`)
  }
}

for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
  const p = base({ type: 'targeted', majors: ['chest'], equipment: GYM, durationMin: null, moves: 5 })
  const w = gen.generateWorkout(p, ctx, seed)
  const covered = subsOf(w)
  for (const g of ['pec_upper', 'pec_mid', 'pec_lower']) check((covered[g] || 0) >= 0.2, `chest seed ${seed}: ${g} barely trained (${(covered[g] || 0).toFixed(2)})`)
}
for (const seed of [1, 2, 3, 4, 5, 6]) {
  const p = base({ type: 'targeted', majors: ['legs'], equipment: GYM, durationMin: null, moves: 5 })
  const w = gen.generateWorkout(p, ctx, seed)
  const covered = subsOf(w)
  for (const g of ['quad_vl', 'ham_bf', 'glute_max']) check((covered[g] || 0) >= 0.2, `legs seed ${seed}: ${g} barely trained`)
}
for (const seed of [1, 2, 3, 4, 5, 6]) {
  const p = base({ type: 'targeted', majors: ['back'], equipment: GYM, durationMin: null, moves: 5 })
  const w = gen.generateWorkout(p, ctx, seed)
  const pats = patternsOf(w)
  check(pats.has('vpull') && pats.has('hpull'), `back seed ${seed}: patterns ${[...pats]}`)
}

// Variety: different seeds should not all give the same workout.
{
  const p = base({ majors: ALL_MAJORS, equipment: GYM, durationMin: null, moves: 6 })
  const variants = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => gen.generateWorkout(p, ctx, s).items.map((i) => i.exerciseId).join()))
  check(variants.size >= 5, `only ${variants.size} distinct workouts from 8 seeds`)
}

// Swap keeps the workout valid.
{
  const p = base({ majors: ALL_MAJORS, equipment: GYM, durationMin: null, moves: 6 })
  const w = gen.generateWorkout(p, ctx, 11)
  for (let i = 0; i < w.items.length; i++) {
    const s = gen.swapExercise(w, i, ctx, 99 + i)
    const ids = s.items.map((x) => x.exerciseId)
    check(new Set(ids).size === ids.length, `swap ${i}: duplicate`)
    check(ids[i] !== w.items[i].exerciseId, `swap ${i}: unchanged`)
  }
}

// Bar / bench gating at home.
{
  const p = base({ majors: ['back'], location: 'home', equipment: HOME, hasBar: false, hasBench: false, durationMin: null, moves: 6 })
  for (const seed of [1, 2, 3, 4]) {
    const w = gen.generateWorkout(p, ctx, seed)
    for (const it of w.items) {
      const n = ctx.byId[it.exerciseId].name
      check(!/pull-?up|chin|bench/i.test(n), `home back: ${n}`)
    }
  }
}

if (verbose) {
  const show = (label, p, seed) => {
    const w = gen.generateWorkout(p, ctx, seed)
    console.log(`\n== ${label}  [${w.name}] ~${w.estMin} min`)
    for (const it of w.items) {
      const ex = ctx.byId[it.exerciseId]
      console.log(`  ${it.pairId ? it.pairId + ' ' : '  '}${ex.name} (${ex.equipment}, ${ex.level}) ${it.sets}x${it.repMin}-${it.repMax} rest ${it.restSec}s  [${it.pattern}]`)
    }
    if (w.cooldown.length) console.log('  cooldown:', w.cooldown.map((c) => c.name).join('; '))
    if (w.warmupNote) console.log('  ', w.warmupNote)
    for (const x of w.warnings) console.log('  !', x.text)
    if (w.unreachable.length) console.log('  unreachable:', w.unreachable.join(','))
  }
  show('gym full body 45min', base({ equipment: GYM, majors: ALL_MAJORS }), 5)
  show('home full body 30min beginner', base({ location: 'home', equipment: HOME, hasBar: false, hasBench: false, level: 'beginner', durationMin: 30 }), 5)
  show('gym chest 5 moves', base({ type: 'targeted', majors: ['chest'], equipment: GYM, durationMin: null, moves: 5 }), 3)
  show('gym legs 6 moves strength', base({ type: 'targeted', majors: ['legs'], equipment: GYM, goal: 'strength', durationMin: null, moves: 6 }), 3)
  show('gym back+arms 25min supersets', base({ type: 'targeted', majors: ['back', 'arms'], equipment: GYM, durationMin: 25, moves: 8, supersets: true }), 3)
}

console.log(`${runs} generated workouts, ${failures} failed checks`)
process.exit(failures ? 1 : 0)
