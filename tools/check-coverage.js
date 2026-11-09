// Standalone sanity check for the swap list (substitutesFor) and the Coverage
// gap suggestions (suggestExercises) in src/lib/coverage.js.
// Run: node tools/check-coverage.js. Exits non-zero on any failed assertion.
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
const cov = await import('../src/lib/coverage.js')
const { STAPLES } = await import('../src/lib/staples.js')
const { DEFAULT_TARGETS } = await import('../src/lib/constants.js')

const exercises = JSON.parse(readFileSync(new URL('../src/data/exercises.json', import.meta.url), 'utf8'))
const byId = Object.fromEntries(exercises.map((e) => [e.id, e]))
const index = { list: exercises, byId }
const GYM = ['barbell', 'dumbbell', 'cable', 'machine', 'body only', 'kettlebells', 'e-z curl bar', 'bands', 'medicine ball', 'other']
const HOME = ['body only', 'dumbbell', 'bands', 'exercise ball']
const LIFTS = new Set(['strength', 'powerlifting'])

let failures = 0
function check(ok, msg) {
  if (!ok) {
    failures += 1
    if (failures <= 25) console.error('FAIL:', msg)
  }
}
const names = (list) => list.map((s) => s.exercise.name).join(', ')

// Swap list: lifts only for a lift, stretches only for a stretch, never the
// exercise itself, at most two per equipment type when there is room.
for (const equipmentProfile of [GYM, HOME]) {
  for (const id of STAPLES) {
    if (!byId[id] || !equipmentProfile.includes(byId[id].equipment)) continue
    const subs = cov.substitutesFor(id, { index, equipmentProfile, maxLevel: 'expert' })
    check(subs.length > 0, `${id}: no substitutes`)
    for (const s of subs) {
      check(s.exercise.id !== id, `${id}: offered itself`)
      check(LIFTS.has(s.exercise.category), `${id}: offered ${s.exercise.name} [${s.exercise.category}]`)
    }
    const all = cov.substitutesFor(id, { index, equipmentProfile, maxLevel: 'expert', n: 999 })
    const kinds = new Set(all.map((s) => s.exercise.equipment)).size
    const per = {}
    for (const s of subs) per[s.exercise.equipment] = (per[s.exercise.equipment] || 0) + 1
    if (kinds >= 3) check(Math.max(...Object.values(per)) <= 2, `${id}: equipment not mixed (${names(subs)})`)
  }
}
for (const st of exercises.filter((e) => e.category === 'stretching' && e.sub).slice(0, 40)) {
  for (const s of cov.substitutesFor(st.id, { index, equipmentProfile: GYM, maxLevel: 'expert' })) {
    check(s.exercise.category === 'stretching', `stretch ${st.name}: offered ${s.exercise.name} [${s.exercise.category}]`)
  }
}
// Staples first among exact ties (these used to lose to the alphabet).
const expectSubs = {
  'Barbell_Bench_Press_-_Medium_Grip': ['Dumbbell_Bench_Press', 'Machine_Bench_Press', 'Cable_Chest_Press'],
  Barbell_Squat: ['Barbell_Full_Squat', 'Dumbbell_Squat', 'Smith_Machine_Squat'],
  'Wide-Grip_Lat_Pulldown': ['Close-Grip_Front_Lat_Pulldown', 'Pullups'],
  Romanian_Deadlift: ['Stiff-Legged_Barbell_Deadlift', 'Stiff-Legged_Dumbbell_Deadlift'],
}
for (const [id, want] of Object.entries(expectSubs)) {
  const subs = cov.substitutesFor(id, { index, equipmentProfile: GYM, maxLevel: 'expert' })
  for (const w of want) check(subs.some((s) => s.exercise.id === w), `${id}: expected ${w} in (${names(subs)})`)
}
// Same input, same list (a dropdown must not reshuffle between renders).
check(
  names(cov.substitutesFor('Barbell_Squat', { index, equipmentProfile: GYM, maxLevel: 'expert' })) ===
    names(cov.substitutesFor('Barbell_Squat', { index, equipmentProfile: GYM, maxLevel: 'expert' })),
  'substitutes not stable',
)

// Gap suggestions: lifts only, staples first, every gap gets candidates.
const allBelow = {}
for (const g of Object.keys(DEFAULT_TARGETS)) allBelow[g] = { status: 'below', deficit: 5, value: 0 }
for (const equipmentProfile of [GYM, HOME]) {
  const sug = cov.suggestExercises({ statuses: allBelow, exercises, equipmentProfile, maxLevel: 'expert' })
  for (const [g, list] of Object.entries(sug)) {
    // A few sub-groups (serratus, tibialis) have no lifts in the dataset.
    const trainable = exercises.some((e) => LIFTS.has(e.category) && equipmentProfile.includes(e.equipment) && (e.sub?.[g] || 0) > 0)
    if (trainable) check(list.length > 0, `gap ${g}: no suggestions`)
    for (const s of list) {
      check(LIFTS.has(s.exercise.category), `gap ${g}: ${s.exercise.name} [${s.exercise.category}]`)
      check((s.exercise.sub[g] || 0) > 0, `gap ${g}: ${s.exercise.name} does not train it`)
    }
  }
}
{
  const sug = cov.suggestExercises({ statuses: allBelow, exercises, equipmentProfile: GYM, maxLevel: 'expert' })
  const expectGap = {
    pec_mid: ['Barbell_Bench_Press_-_Medium_Grip', 'Dumbbell_Bench_Press'],
    lat: ['Pullups', 'Wide-Grip_Lat_Pulldown'],
    calf_gastroc: ['Standing_Calf_Raises'],
    abs_upper: ['Crunches', 'Ab_Roller', 'Cable_Crunch'],
  }
  for (const [g, want] of Object.entries(expectGap)) {
    check(want.some((w) => sug[g].some((s) => s.exercise.id === w)), `gap ${g}: none of ${want} in (${names(sug[g])})`)
  }
  // Excluded (already in the routine) exercises stay out.
  const ex = cov.suggestExercises({ statuses: { pec_mid: allBelow.pec_mid }, exercises, equipmentProfile: GYM, maxLevel: 'expert', excludeIds: new Set(['Barbell_Bench_Press_-_Medium_Grip']) })
  check(!ex.pec_mid.some((s) => s.exercise.id === 'Barbell_Bench_Press_-_Medium_Grip'), 'gap: excluded id suggested')
  // Level cap holds.
  const beg = cov.suggestExercises({ statuses: allBelow, exercises, equipmentProfile: GYM, maxLevel: 'beginner' })
  for (const list of Object.values(beg)) for (const s of list) check(s.exercise.level === 'beginner', `gap beginner: ${s.exercise.name} is ${s.exercise.level}`)
}

console.log(`coverage checks: ${failures} failed`)
process.exit(failures ? 1 : 0)
