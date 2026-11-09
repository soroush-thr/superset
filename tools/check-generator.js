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
const EXERCISE_LEVEL = { beginner: 'beginner', intermediate: 'intermediate', advanced: 'expert' }
// Single levels plus the mixes people actually pick.
const LEVEL_SETS = [['beginner'], ['intermediate'], ['advanced'], ['beginner', 'intermediate'], ['intermediate', 'advanced']]

let failures = 0
let runs = 0
function check(ok, msg) {
  if (!ok) {
    failures += 1
    if (process.argv.includes("--all") || failures <= 25) console.error('FAIL:', msg)
  }
}

function base(over) {
  return { ...gen.GENERATOR_DEFAULTS, ...over }
}

const ALL_MAJORS = ['chest', 'back', 'shoulders', 'arms', 'core', 'legs']
const scenarios = []
for (const location of ['home', 'gym']) {
  for (const levels of LEVEL_SETS) {
    for (const goal of gen.GENERATOR_GOALS) {
      const common = {
        location,
        levels,
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
    const tag = `${params.location}/${params.levels.join('+')}/${params.goal}/${params.type}:${params.majors.join('+')}/t${params.durationMin}/m${params.moves}/s${seed}`
    const again = seed === 1 ? gen.generateWorkout(params, ctx, seed) : w
    check(JSON.stringify(again.items) === JSON.stringify(w.items), `${tag}: not deterministic`)

    const ids = w.items.map((i) => i.exerciseId)
    check(new Set(ids).size === ids.length, `${tag}: duplicate exercise`)
    const equip = new Set(params.equipment)
    for (const id of ids) {
      const ex = ctx.byId[id]
      check(equip.has(ex.equipment), `${tag}: ${ex.name} needs ${ex.equipment}`)
      check(params.levels.some((l) => EXERCISE_LEVEL[l] === ex.level), `${tag}: ${ex.name} is ${ex.level}`)
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
      check(ids.length === want || w.warnings.some((x) => x.kind === 'few' || x.kind === 'empty'), `${tag}: expected ${want} moves, got ${ids.length}`)
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

// Variety per slot: across many seeds each basic pattern of a gym full-body
// day draws from a real spread of exercises, not a fixed two or three, and
// with or without "favour undertrained".
for (const favourUndertrained of [false, true]) {
  const p = base({ majors: ALL_MAJORS, equipment: GYM, favourUndertrained })
  const byPattern = {}
  const all = new Set()
  for (let s = 1; s <= 200; s++) {
    for (const it of gen.generateWorkout(p, ctx, s * 7919).items) {
      ;(byPattern[it.pattern] ||= new Set()).add(it.exerciseId)
      all.add(it.exerciseId)
    }
  }
  check(all.size >= 70, `full body fav=${favourUndertrained}: only ${all.size} distinct exercises over 200 seeds`)
  // A gym has about four sensible vertical pulls (pull-up, chin-up and two
  // pulldowns); every other basic pattern has many more.
  for (const [pat, min] of [['squat', 7], ['hinge', 7], ['hpush', 7], ['hpull', 7], ['vpush', 7], ['vpull', 4], ['core', 7]]) {
    check((byPattern[pat]?.size || 0) >= min,`full body fav=${favourUndertrained}: ${pat} only ${byPattern[pat]?.size || 0} distinct`)
  }
  // Exact score ties (same press on barbell / dumbbell / machine) must all
  // get a chance -- the flat bench press used to lose every tie on order.
  const hpush = byPattern.hpush || new Set()
  check(
    ['Barbell_Bench_Press_-_Medium_Grip', 'Dumbbell_Bench_Press', 'Machine_Bench_Press', 'Cable_Chest_Press'].some((id) => hpush.has(id)),
    `full body fav=${favourUndertrained}: no flat press ever picked (${[...hpush]})`,
  )
}

// Regenerate steers away from the workout on screen.
{
  const p = base({ majors: ALL_MAJORS, equipment: GYM })
  let repeated = 0
  let prev = gen.generateWorkout(p, ctx, 1)
  for (let s = 2; s <= 60; s++) {
    const w = gen.generateWorkout(p, ctx, s, { avoid: prev.items.map((i) => i.exerciseId) })
    const before = new Set(prev.items.map((i) => i.exerciseId))
    repeated += w.items.filter((i) => before.has(i.exerciseId)).length
    prev = w
  }
  check(repeated / 59 < 0.5, `regenerate repeats ${(repeated / 59).toFixed(2)} exercises on average`)
}

// Repeated swaps of one slot walk through new options of the same pattern,
// stay valid and deterministic, and start over once the slot is exhausted.
for (const [loc, equipment] of [['gym', GYM], ['home', HOME]]) {
  const p = base({ majors: ALL_MAJORS, location: loc, equipment, hasBar: loc === 'gym', hasBench: loc === 'gym' })
  const w0 = gen.generateWorkout(p, ctx, 21)
  for (let i = 0; i < w0.items.length; i++) {
    let w = w0
    const seen = new Set([w0.items[i].exerciseId])
    let firstRepeat = null // distinct count when an exercise first came back
    let samePattern = 0
    for (let k = 0; k < 10; k++) {
      const next = gen.swapExercise(w, i, ctx, 500 + k)
      check(JSON.stringify(gen.swapExercise(w, i, ctx, 500 + k).items) === JSON.stringify(next.items), `${loc} swap ${i}: not deterministic`)
      const ids = next.items.map((x) => x.exerciseId)
      check(new Set(ids).size === ids.length, `${loc} swap ${i}.${k}: duplicate`)
      check(ids[i] !== w.items[i].exerciseId, `${loc} swap ${i}.${k}: unchanged`)
      if (next.items[i].pattern === w0.items[i].pattern) samePattern += 1
      if (seen.has(ids[i]) && firstRepeat == null) firstRepeat = seen.size
      seen.add(ids[i])
      w = next
    }
    const name = ctx.byId[w0.items[i].exerciseId].name
    // Nothing comes back until every option has been shown once.
    check(firstRepeat == null || firstRepeat === seen.size, `${loc} swap slot ${i} (${name}): repeated after ${firstRepeat} of ${seen.size} options`)
    if (loc === 'gym') check(seen.size >= 9, `gym swap slot ${i} (${name}): only ${seen.size} distinct in 10 swaps`)
    else check(seen.size >= 3, `home swap slot ${i} (${name}): only ${seen.size} distinct in 10 swaps`)
    check(samePattern === 10, `${loc} swap slot ${i} (${name}): pattern changed in ${10 - samePattern} of 10 swaps`)
  }
}
{
  // A tiny pool: swapping keeps working after every option has been shown.
  const p = base({ type: 'targeted', majors: ['chest'], location: 'home', equipment: ['body only'], hasBar: false, hasBench: false, durationMin: null, moves: 2 })
  let w = gen.generateWorkout(p, ctx, 3)
  for (let k = 0; k < 40; k++) {
    const next = gen.swapExercise(w, 0, ctx, 900 + k)
    check(next.items[0].exerciseId !== w.items[0].exerciseId, `tiny pool swap ${k}: stuck`)
    w = next
  }
}

// Cooldown stretches vary across workouts and stay on the worked muscles.
{
  const p = base({ majors: ALL_MAJORS, equipment: GYM })
  const counts = new Map()
  for (let s = 1; s <= 200; s++) for (const c of gen.generateWorkout(p, ctx, s * 31).cooldown) counts.set(c.exerciseId, (counts.get(c.exerciseId) || 0) + 1)
  check(counts.size >= 50, `cooldown: only ${counts.size} distinct stretches over 200 workouts`)
  check(Math.max(...counts.values()) / 200 <= 0.45, `cooldown: one stretch in ${Math.round((100 * Math.max(...counts.values())) / 200)}% of workouts`)
  const legs = base({ type: 'targeted', majors: ['legs'], equipment: GYM })
  for (let s = 1; s <= 20; s++) {
    for (const c of gen.generateWorkout(legs, ctx, s).cooldown) {
      const sub = ctx.byId[c.exerciseId].sub
      const lower = Object.entries(sub).filter(([g]) => SUBGROUP_BY_ID[g].major === 'legs' || g === 'erector').reduce((t, [, v]) => t + v, 0)
      check(lower > 0, `legs cooldown ${s}: ${c.name} stretches no lower-body muscle`)
    }
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
  show('home full body 30min beginner', base({ location: 'home', equipment: HOME, hasBar: false, hasBench: false, levels: ['beginner'], durationMin: 30 }), 5)
  show('gym chest 5 moves', base({ type: 'targeted', majors: ['chest'], equipment: GYM, durationMin: null, moves: 5 }), 3)
  show('gym legs 6 moves strength', base({ type: 'targeted', majors: ['legs'], equipment: GYM, goal: 'strength', durationMin: null, moves: 6 }), 3)
  show('gym back+arms 25min supersets', base({ type: 'targeted', majors: ['back', 'arms'], equipment: GYM, durationMin: 25, moves: 8, supersets: true }), 3)
}

console.log(`${runs} generated workouts, ${failures} failed checks`)
process.exit(failures ? 1 : 0)
