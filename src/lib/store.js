// Persistence, reducer, and the sync seam. See BUILD-PLAN.md section 5.
//
// The four exports below (loadState, saveState, serialize, deserialize) are
// the entire persistence surface. A future sync adapter (section 13, item 3)
// swaps only these four; nothing else in the app should touch localStorage
// directly.
import { DEFAULT_TARGETS, SET_TYPES } from './constants.js'
import { TEMPLATES_BY_ID } from './templates.js'

export const STORAGE_KEY = 'superset.v1'
const PERSIST_DEBOUNCE_MS = 300

const DEFAULT_EQUIPMENT_PROFILES = {
  home: ['body only', 'dumbbell', 'bands', 'exercise ball'],
  gym: [
    'barbell',
    'dumbbell',
    'cable',
    'machine',
    'body only',
    'kettlebells',
    'e-z curl bar',
    'bands',
    'medicine ball',
    'other',
  ],
}

function emptyState() {
  return {
    version: 1,
    settings: {
      equipmentProfiles: DEFAULT_EQUIPMENT_PROFILES,
      activeProfile: 'gym',
      maxLevel: 'expert',
      creditMode: 'peak',
      unit: 'kg', // 'kg' | 'lb', display only -- weights are always stored in kg
      targets: {}, // only user overrides live here; defaults are seeded at read time (5.2)
    },
    routines: [],
    activeRoutineId: null,
    sessions: [],
    activeSessionId: null,
    customExercises: [],
    favorites: [],
    bodyLog: [],
    onboardingComplete: false,
  }
}

/** Section 5.2: seed settings.targets from DEFAULT_TARGETS for any sub-group
 *  the user hasn't overridden, without persisting the unchanged defaults. */
export function targetsWithDefaults(state) {
  return { ...DEFAULT_TARGETS, ...state.settings.targets }
}

/** A routine's optional deload cycle: [1, 1, 1, 0.5] means "weeks 1-3 run
 *  the plan at full volume, week 4 at half". Absent or empty defaults to a
 *  single full-volume week, so every routine created before this feature
 *  shipped is unaffected. */
export function weeksWithDefault(routine) {
  return routine.weeks && routine.weeks.length > 0 ? routine.weeks : [1]
}

/** JSON-serialize state for export, section 5.4. Adds exportedAt. */
export function serialize(state) {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString() })
}

/** Parse and validate a serialized state string. Throws on invalid JSON or
 *  an unsupported version; callers decide how to handle that. Fills in keys
 *  added after v1 shipped (read-time defaulting, same idea as
 *  targetsWithDefaults) so an older export still loads cleanly without a
 *  real schema migration. */
export function deserialize(text) {
  const parsed = JSON.parse(text)
  if (parsed.version !== 1) {
    throw new Error(`Unsupported state version: ${parsed.version}`)
  }
  return {
    ...parsed,
    sessions: parsed.sessions ?? [],
    activeSessionId: parsed.activeSessionId ?? null,
    customExercises: parsed.customExercises ?? [],
    favorites: parsed.favorites ?? [],
    bodyLog: parsed.bodyLog ?? [],
    onboardingComplete: parsed.onboardingComplete ?? false,
  }
}

/** Section 5.2: read from localStorage. Never throws — on parse failure,
 *  backs up the corrupt value and returns a fresh empty state. */
export function loadState() {
  let raw
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return emptyState()
  }
  if (!raw) return emptyState()

  try {
    return deserialize(raw)
  } catch (err) {
    try {
      localStorage.setItem(`${STORAGE_KEY}.corrupt.${Date.now()}`, raw)
    } catch {
      // best-effort backup; if this also fails there is nothing more to do
    }
    console.error('Corrupt localStorage state, starting fresh:', err)
    return emptyState()
  }
}

let pendingWrite = null

/** Section 5.2: write-through on every mutation, debounced 300ms. */
export function saveState(state) {
  if (pendingWrite) clearTimeout(pendingWrite)
  pendingWrite = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serialize(state))
    } catch (err) {
      console.error('Failed to persist state:', err)
    }
    pendingWrite = null
  }, PERSIST_DEBOUNCE_MS)
}

/** Flush any pending debounced write immediately (e.g. before an import
 *  overwrites state, or on page unload). */
export function flushSave(state) {
  if (pendingWrite) {
    clearTimeout(pendingWrite)
    pendingWrite = null
  }
  try {
    localStorage.setItem(STORAGE_KEY, serialize(state))
  } catch (err) {
    console.error('Failed to persist state:', err)
  }
}

// --------------------------------------------------------------- reducer

export function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function newRoutine(name = 'New Routine') {
  return {
    id: uid('r'),
    name,
    cycleDays: 7,
    days: [],
  }
}

export function newDay(name = 'New Day') {
  return { id: uid('d'), name, note: '', slots: [] }
}

export function newSlot(exerciseId) {
  return {
    id: uid('s'),
    type: 'single',
    entries: [
      {
        exerciseId,
        sets: 3,
        repMin: 8,
        repMax: 12,
        restSec: 90,
        rpe: null,
        tempo: '',
        setType: 'normal',
        note: '',
      },
    ],
  }
}

function findRoutine(state, routineId) {
  return state.routines.find((r) => r.id === routineId)
}

// Custom exercises clone an existing exercise's `sub` weight vector rather
// than being built from scratch, so they stay on the same scale as the
// curated built-in data (see coverage.js -- everything downstream of `sub`
// assumes it came from the same weighting convention).
function newCustomExercise({
  baseId = null,
  name,
  sub,
  equipment = 'body only',
  level = 'intermediate',
  mechanic = 'compound',
  force = 'push',
}) {
  return {
    id: uid('x'),
    name,
    level,
    equipment,
    mechanic,
    force,
    category: 'strength',
    primary: [],
    secondary: [],
    steps: [],
    images: [],
    sub,
    conf: 'user',
    reviewed: true,
    custom: true,
    baseId,
    deleted: false,
  }
}

function instantiateTemplateDay(day) {
  return {
    id: uid('d'),
    name: day.name,
    note: '',
    slots: day.exercises.map((ex) => ({
      id: uid('s'),
      type: 'single',
      entries: [
        {
          exerciseId: ex.exerciseId,
          sets: ex.sets,
          repMin: ex.repMin,
          repMax: ex.repMax,
          restSec: ex.restSec,
          rpe: null,
          tempo: '',
          setType: 'normal',
          note: '',
        },
      ],
    })),
  }
}

// A shared routine arrives as arbitrary JSON decoded from a URL someone
// else sent -- never spread it into state directly. Rebuild it field by
// field from only the keys the app understands, with sane fallbacks for
// anything missing or malformed, and fresh ids at every level (the same fix
// DUPLICATE_ROUTINE needed).
function sanitizeSharedEntry(e) {
  if (!e || typeof e.exerciseId !== 'string') return null
  return {
    exerciseId: e.exerciseId,
    sets: Number.isFinite(e.sets) ? e.sets : 3,
    repMin: Number.isFinite(e.repMin) ? e.repMin : 8,
    repMax: Number.isFinite(e.repMax) ? e.repMax : 12,
    restSec: Number.isFinite(e.restSec) ? e.restSec : 90,
    rpe: Number.isFinite(e.rpe) ? e.rpe : null,
    tempo: typeof e.tempo === 'string' ? e.tempo : '',
    setType: SET_TYPES.includes(e.setType) ? e.setType : 'normal',
    note: typeof e.note === 'string' ? e.note : '',
  }
}

function sanitizeSharedRoutine(raw) {
  if (!raw || typeof raw.name !== 'string' || !Array.isArray(raw.days)) return null
  return {
    id: uid('r'),
    name: raw.name.slice(0, 200),
    cycleDays: Number.isFinite(raw.cycleDays) && raw.cycleDays > 0 ? raw.cycleDays : 7,
    days: raw.days.map((d) => ({
      id: uid('d'),
      name: typeof d?.name === 'string' ? d.name.slice(0, 200) : 'Day',
      note: typeof d?.note === 'string' ? d.note : '',
      slots: (Array.isArray(d?.slots) ? d.slots : [])
        .map((s) => {
          const entries = (Array.isArray(s?.entries) ? s.entries : [])
            .map(sanitizeSharedEntry)
            .filter(Boolean)
          if (entries.length === 0) return null
          return { id: uid('s'), type: s.type === 'paired' ? 'paired' : 'single', entries }
        })
        .filter(Boolean),
    })),
  }
}

// A session's entries snapshot their planned targets at start time (not a
// reference to the plan entry) so editing or deleting the routine later
// never rewrites or orphans a logged session.
function newSessionEntry(exerciseId, target = {}, sets = []) {
  return {
    id: uid('sen'),
    exerciseId,
    targetSets: target.sets ?? null,
    targetRepMin: target.repMin ?? null,
    targetRepMax: target.repMax ?? null,
    targetRestSec: target.restSec ?? null,
    sets,
  }
}

// Sessions start with their sets already laid out as not-done rows, so the
// active screen is a checklist to tick off rather than a list to build.
// Weights are pre-filled from the last finished session of the exercise
// (reps are left for the user, with the target shown as a placeholder).
const DEFAULT_ADHOC_SETS = 3

function lastDoneSets(state, exerciseId) {
  const finished = state.sessions
    .filter((s) => s.endedAt && s.entries.some((e) => e.exerciseId === exerciseId && e.sets.some((x) => x.done)))
    .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))[0]
  const entry = finished?.entries.find((e) => e.exerciseId === exerciseId && e.sets.some((x) => x.done))
  return entry ? entry.sets.filter((x) => x.done) : []
}

function plannedSets(count, prefill = []) {
  const n = Number.isFinite(count) && count > 0 ? Math.min(count, 20) : DEFAULT_ADHOC_SETS
  return Array.from({ length: n }, (_, i) => {
    const p = prefill[i] ?? prefill[prefill.length - 1]
    return newLoggedSet({ weightKg: p?.weightKg ?? null, done: false })
  })
}

// Entries of a generated workout carry two optional extras: `pairId`
// (superset partners share one letter) and `kind: 'cooldown'` (a stretch --
// logged like any entry but excluded from volume).
function generatedSessionEntry(item, state) {
  const entry = newSessionEntry(
    item.exerciseId,
    { sets: item.sets, repMin: item.repMin, repMax: item.repMax, restSec: item.restSec },
    plannedSets(item.sets, lastDoneSets(state, item.exerciseId)),
  )
  if (item.pairId) entry.pairId = item.pairId
  if (item.unit === 'sec') entry.targetUnit = 'sec'
  return entry
}

function newLoggedSet({ weightKg = null, reps = null, rpe = null, setType = 'normal', done = true } = {}) {
  return { id: uid('set'), weightKg, reps, rpe, setType, done, ts: new Date().toISOString() }
}

function newSession({ routineId = null, dayId = null, dayName = '', entries = [] } = {}) {
  return {
    id: uid('ses'),
    startedAt: new Date().toISOString(),
    endedAt: null,
    routineId,
    dayId,
    dayName,
    note: '',
    restEndsAt: null,
    entries,
  }
}

function newBodyLogEntry({ date, weightKg, note = '' }) {
  return { id: uid('bw'), date, weightKg, note }
}

export function reducer(state, action) {
  switch (action.type) {
    case 'REPLACE_STATE':
      return action.state

    case 'CREATE_ROUTINE': {
      const routine = newRoutine(action.name)
      return {
        ...state,
        routines: [...state.routines, routine],
        activeRoutineId: routine.id,
      }
    }

    case 'RENAME_ROUTINE':
      return {
        ...state,
        routines: state.routines.map((r) =>
          r.id === action.routineId ? { ...r, name: action.name } : r,
        ),
      }

    case 'DUPLICATE_ROUTINE': {
      const src = findRoutine(state, action.routineId)
      if (!src) return state
      // Fresh ids at every level -- a naive structuredClone(src) copies the
      // day and slot ids verbatim, which collide with the original routine.
      const copy = {
        id: uid('r'),
        name: `${src.name} copy`,
        cycleDays: src.cycleDays,
        days: src.days.map((d) => ({
          id: uid('d'),
          name: d.name,
          note: d.note,
          slots: d.slots.map((s) => ({
            id: uid('s'),
            type: s.type,
            entries: s.entries.map((e) => ({ ...e })),
          })),
        })),
      }
      return { ...state, routines: [...state.routines, copy], activeRoutineId: copy.id }
    }

    case 'INSTANTIATE_TEMPLATE': {
      const template = TEMPLATES_BY_ID[action.templateId]
      if (!template) return state
      const routine = {
        id: uid('r'),
        name: template.name,
        cycleDays: template.cycleDays,
        days: template.days.map(instantiateTemplateDay),
      }
      return { ...state, routines: [...state.routines, routine], activeRoutineId: routine.id }
    }

    case 'IMPORT_SHARED_ROUTINE': {
      const routine = sanitizeSharedRoutine(action.routine)
      if (!routine) return state
      return { ...state, routines: [...state.routines, routine], activeRoutineId: routine.id }
    }

    case 'DELETE_ROUTINE': {
      const routines = state.routines.filter((r) => r.id !== action.routineId)
      const activeRoutineId =
        state.activeRoutineId === action.routineId
          ? routines[0]?.id ?? null
          : state.activeRoutineId
      return { ...state, routines, activeRoutineId }
    }

    case 'SET_ACTIVE_ROUTINE':
      return { ...state, activeRoutineId: action.routineId }

    case 'SET_CYCLE_DAYS':
      return {
        ...state,
        routines: state.routines.map((r) =>
          r.id === action.routineId ? { ...r, cycleDays: action.cycleDays } : r,
        ),
      }

    case 'SET_ROUTINE_WEEKS':
      return {
        ...state,
        routines: state.routines.map((r) =>
          r.id === action.routineId ? { ...r, weeks: action.weeks } : r,
        ),
      }

    case 'ADD_DAY':
      return {
        ...state,
        routines: state.routines.map((r) =>
          r.id === action.routineId ? { ...r, days: [...r.days, newDay(action.name)] } : r,
        ),
      }

    case 'REORDER_DAY': {
      return {
        ...state,
        routines: state.routines.map((r) => {
          if (r.id !== action.routineId) return r
          const days = [...r.days]
          const idx = days.findIndex((d) => d.id === action.dayId)
          const swapWith = idx + action.direction
          if (idx < 0 || swapWith < 0 || swapWith >= days.length) return r
          ;[days[idx], days[swapWith]] = [days[swapWith], days[idx]]
          return { ...r, days }
        }),
      }
    }

    case 'UPDATE_DAY':
      return {
        ...state,
        routines: state.routines.map((r) => {
          if (r.id !== action.routineId) return r
          return {
            ...r,
            days: r.days.map((d) => (d.id === action.dayId ? { ...d, ...action.patch } : d)),
          }
        }),
      }

    case 'DELETE_DAY':
      return {
        ...state,
        routines: state.routines.map((r) =>
          r.id === action.routineId
            ? { ...r, days: r.days.filter((d) => d.id !== action.dayId) }
            : r,
        ),
      }

    case 'ADD_SLOT':
      return {
        ...state,
        routines: state.routines.map((r) => {
          if (r.id !== action.routineId) return r
          return {
            ...r,
            days: r.days.map((d) =>
              d.id === action.dayId
                ? { ...d, slots: [...d.slots, newSlot(action.exerciseId)] }
                : d,
            ),
          }
        }),
      }

    case 'UPDATE_ENTRY':
      return {
        ...state,
        routines: state.routines.map((r) => {
          if (r.id !== action.routineId) return r
          return {
            ...r,
            days: r.days.map((d) => {
              if (d.id !== action.dayId) return d
              return {
                ...d,
                slots: d.slots.map((s) => {
                  if (s.id !== action.slotId) return s
                  return {
                    ...s,
                    entries: s.entries.map((e, i) =>
                      i === action.entryIndex ? { ...e, ...action.patch } : e,
                    ),
                  }
                }),
              }
            }),
          }
        }),
      }

    case 'DELETE_SLOT':
      return {
        ...state,
        routines: state.routines.map((r) => {
          if (r.id !== action.routineId) return r
          return {
            ...r,
            days: r.days.map((d) =>
              d.id === action.dayId
                ? { ...d, slots: d.slots.filter((s) => s.id !== action.slotId) }
                : d,
            ),
          }
        }),
      }

    // Drag-and-drop reordering (section 4.3), layered on top of the
    // existing up/down day buttons rather than replacing them -- those were
    // a deliberate touch-reliability choice (BUILD-PLAN.md).
    case 'REORDER_SLOT':
      return {
        ...state,
        routines: state.routines.map((r) => {
          if (r.id !== action.routineId) return r
          return {
            ...r,
            days: r.days.map((d) => {
              if (d.id !== action.dayId) return d
              const slots = [...d.slots]
              const [moved] = slots.splice(action.fromIndex, 1)
              if (!moved) return d
              slots.splice(action.toIndex, 0, moved)
              return { ...d, slots }
            }),
          }
        }),
      }

    case 'MOVE_SLOT':
      return {
        ...state,
        routines: state.routines.map((r) => {
          if (r.id !== action.routineId) return r
          const fromDay = r.days.find((d) => d.id === action.fromDayId)
          const slot = fromDay?.slots.find((s) => s.id === action.slotId)
          if (!slot) return r
          return {
            ...r,
            days: r.days.map((d) => {
              if (d.id === action.fromDayId) {
                return { ...d, slots: d.slots.filter((s) => s.id !== action.slotId) }
              }
              if (d.id === action.toDayId) {
                const slots = [...d.slots]
                slots.splice(Math.min(action.toIndex, slots.length), 0, slot)
                return { ...d, slots }
              }
              return d
            }),
          }
        }),
      }

    // "Make superset" / "Split" -- section 1a rule 1: stored type is
    // paired, never the product name. UI label stays Superset (rule 2).
    case 'MERGE_SLOTS_AS_PAIRED':
      return {
        ...state,
        routines: state.routines.map((r) => {
          if (r.id !== action.routineId) return r
          return {
            ...r,
            days: r.days.map((d) => {
              if (d.id !== action.dayId) return d
              const idx = d.slots.findIndex((s) => s.id === action.slotId)
              if (idx < 0 || idx + 1 >= d.slots.length) return d
              const merged = {
                id: d.slots[idx].id,
                type: 'paired',
                entries: [...d.slots[idx].entries, ...d.slots[idx + 1].entries],
              }
              const slots = [...d.slots]
              slots.splice(idx, 2, merged)
              return { ...d, slots }
            }),
          }
        }),
      }

    case 'SPLIT_PAIRED_SLOT':
      return {
        ...state,
        routines: state.routines.map((r) => {
          if (r.id !== action.routineId) return r
          return {
            ...r,
            days: r.days.map((d) => {
              if (d.id !== action.dayId) return d
              const idx = d.slots.findIndex((s) => s.id === action.slotId)
              if (idx < 0) return d
              const slot = d.slots[idx]
              const split = slot.entries.map((entry) => ({
                id: uid('s'),
                type: 'single',
                entries: [entry],
              }))
              const slots = [...d.slots]
              slots.splice(idx, 1, ...split)
              return { ...d, slots }
            }),
          }
        }),
      }

    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.patch } }

    case 'SET_TARGET':
      return {
        ...state,
        settings: {
          ...state.settings,
          targets: { ...state.settings.targets, [action.subgroupId]: action.range },
        },
      }

    case 'RESET_SETTINGS':
      return { ...state, settings: emptyState().settings }

    // Sessions -- logged workouts. Routine-driven ("START_SESSION" with a
    // routineId+dayId snapshots that day's entries) or ad-hoc (both null,
    // entries added one at a time via ADD_SESSION_ENTRY).
    case 'START_SESSION': {
      const { routineId, dayId } = action
      let entries = []
      let dayName = ''
      if (routineId && dayId) {
        const day = findRoutine(state, routineId)?.days.find((d) => d.id === dayId)
        if (day) {
          dayName = day.name
          entries = day.slots.flatMap((slot) =>
            slot.entries.map((e) =>
              newSessionEntry(
                e.exerciseId,
                { sets: e.sets, repMin: e.repMin, repMax: e.repMax, restSec: e.restSec },
                plannedSets(e.sets, lastDoneSets(state, e.exerciseId)),
              ),
            ),
          )
        }
      }
      const session = newSession({ routineId: routineId ?? null, dayId: dayId ?? null, dayName, entries })
      return { ...state, sessions: [...state.sessions, session], activeSessionId: session.id }
    }

    // A generated workout (src/lib/generator.js) becomes an ad-hoc session with
    // its targets pre-filled. Refuses while another session is in progress.
    case 'START_GENERATED_SESSION': {
      const w = action.workout
      if (state.activeSessionId || !w || !Array.isArray(w.items) || w.items.length === 0) return state
      const entries = w.items
        .filter((it) => typeof it.exerciseId === 'string')
        .map((it) => generatedSessionEntry(it, state))
      for (const c of Array.isArray(w.cooldown) ? w.cooldown : []) {
        if (typeof c.exerciseId !== 'string') continue
        const entry = newSessionEntry(c.exerciseId, { sets: 1 }, plannedSets(1))
        entry.kind = 'cooldown'
        entry.note = `Hold about ${c.holdSec ?? 30} s`
        entries.push(entry)
      }
      const session = newSession({ dayName: typeof w.name === 'string' ? w.name : 'Generated workout', entries })
      session.note = typeof w.warmupNote === 'string' ? w.warmupNote : ''
      return { ...state, sessions: [...state.sessions, session], activeSessionId: session.id }
    }

    // Save a generated workout as a new day, in an existing routine or a
    // new one. Superset partners become a paired slot; the cooldown lives in
    // the day note rather than as entries, so it never counts toward volume.
    case 'SAVE_GENERATED_DAY': {
      const w = action.workout
      if (!w || !Array.isArray(w.items) || w.items.length === 0) return state
      const toEntry = (it) => ({
        ...newSlot(it.exerciseId).entries[0],
        sets: it.sets,
        repMin: it.repMin,
        repMax: it.repMax,
        restSec: it.restSec,
        ...(it.unit === 'sec' ? { setType: 'isometric' } : {}),
      })
      const slots = []
      const done = new Set()
      for (const it of w.items) {
        if (done.has(it) || typeof it.exerciseId !== 'string') continue
        done.add(it)
        const partner = it.pairId ? w.items.find((o) => o !== it && !done.has(o) && o.pairId === it.pairId) : null
        if (partner) {
          done.add(partner)
          slots.push({ id: uid('s'), type: 'paired', entries: [toEntry(it), toEntry(partner)] })
        } else {
          slots.push({ id: uid('s'), type: 'single', entries: [toEntry(it)] })
        }
      }
      const day = {
        id: uid('d'),
        name: typeof w.name === 'string' ? w.name.slice(0, 200) : 'Generated workout',
        note: [w.warmupNote, w.cooldownNote].filter((t) => typeof t === 'string' && t).join(' '),
        slots,
      }
      const existing = action.routineId ? findRoutine(state, action.routineId) : null
      if (existing) {
        return {
          ...state,
          routines: state.routines.map((r) => (r.id === existing.id ? { ...r, days: [...r.days, day] } : r)),
          activeRoutineId: existing.id,
        }
      }
      const routine = { ...newRoutine('Generated workouts'), days: [day] }
      return { ...state, routines: [...state.routines, routine], activeRoutineId: routine.id }
    }

    case 'ADD_SESSION_ENTRY':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.sessionId
            ? {
                ...s,
                entries: [
                  ...s.entries,
                  newSessionEntry(action.exerciseId, {}, plannedSets(null, lastDoneSets(state, action.exerciseId))),
                ],
              }
            : s,
        ),
      }

    case 'DELETE_SESSION_ENTRY':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.sessionId
            ? { ...s, entries: s.entries.filter((e) => e.id !== action.entryId) }
            : s,
        ),
      }

    case 'LOG_SET':
      return {
        ...state,
        sessions: state.sessions.map((s) => {
          if (s.id !== action.sessionId) return s
          return {
            ...s,
            entries: s.entries.map((e) =>
              e.id === action.entryId
                ? { ...e, sets: [...e.sets, newLoggedSet(action.set)] }
                : e,
            ),
          }
        }),
      }

    case 'UPDATE_SET':
      return {
        ...state,
        sessions: state.sessions.map((s) => {
          if (s.id !== action.sessionId) return s
          return {
            ...s,
            entries: s.entries.map((e) => {
              if (e.id !== action.entryId) return e
              return {
                ...e,
                sets: e.sets.map((set) => (set.id === action.setId ? { ...set, ...action.patch } : set)),
              }
            }),
          }
        }),
      }

    case 'DELETE_SET':
      return {
        ...state,
        sessions: state.sessions.map((s) => {
          if (s.id !== action.sessionId) return s
          return {
            ...s,
            entries: s.entries.map((e) =>
              e.id === action.entryId
                ? { ...e, sets: e.sets.filter((set) => set.id !== action.setId) }
                : e,
            ),
          }
        }),
      }

    case 'END_SESSION':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.sessionId ? { ...s, endedAt: new Date().toISOString(), restEndsAt: null } : s,
        ),
        activeSessionId: state.activeSessionId === action.sessionId ? null : state.activeSessionId,
      }

    case 'DISCARD_SESSION':
      return {
        ...state,
        sessions: state.sessions.filter((s) => s.id !== action.sessionId),
        activeSessionId: state.activeSessionId === action.sessionId ? null : state.activeSessionId,
      }

    case 'UPDATE_SESSION':
      return {
        ...state,
        sessions: state.sessions.map((s) => (s.id === action.sessionId ? { ...s, ...action.patch } : s)),
      }

    case 'SET_REST_TIMER':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.sessionId ? { ...s, restEndsAt: action.restEndsAt } : s,
        ),
      }

    // Custom exercises clone an existing exercise's sub weights (App.jsx's
    // useExercises merges these into the same index the built-in dataset
    // uses). DELETE is a soft delete -- a tombstone, not a removal -- so a
    // routine or logged session that already references it still resolves
    // a name instead of breaking.
    case 'ADD_CUSTOM_EXERCISE': {
      const exercise = newCustomExercise(action)
      return { ...state, customExercises: [...state.customExercises, exercise] }
    }

    case 'UPDATE_CUSTOM_EXERCISE':
      return {
        ...state,
        customExercises: state.customExercises.map((e) =>
          e.id === action.exerciseId ? { ...e, ...action.patch } : e,
        ),
      }

    case 'DELETE_CUSTOM_EXERCISE':
      return {
        ...state,
        customExercises: state.customExercises.map((e) =>
          e.id === action.exerciseId ? { ...e, deleted: true } : e,
        ),
      }

    case 'TOGGLE_FAVORITE': {
      const has = state.favorites.includes(action.exerciseId)
      return {
        ...state,
        favorites: has
          ? state.favorites.filter((id) => id !== action.exerciseId)
          : [...state.favorites, action.exerciseId],
      }
    }

    case 'ADD_BODY_LOG':
      return { ...state, bodyLog: [...state.bodyLog, newBodyLogEntry(action)] }

    case 'DELETE_BODY_LOG':
      return { ...state, bodyLog: state.bodyLog.filter((b) => b.id !== action.id) }

    case 'COMPLETE_ONBOARDING':
      return { ...state, onboardingComplete: true }

    default:
      return state
  }
}

export function initState() {
  return loadState()
}

// ------------------------------------------------------------ undo / redo

// Only routine-editing actions are undoable. Logging a set, adding a
// custom exercise, toggling a favorite, or changing settings must never be
// rewound by Ctrl/Cmd+Z -- those are facts or preferences, not edits to
// take back.
const UNDOABLE_ACTION_TYPES = new Set([
  'CREATE_ROUTINE',
  'RENAME_ROUTINE',
  'DUPLICATE_ROUTINE',
  'DELETE_ROUTINE',
  'INSTANTIATE_TEMPLATE',
  'IMPORT_SHARED_ROUTINE',
  'SET_CYCLE_DAYS',
  'SET_ROUTINE_WEEKS',
  'ADD_DAY',
  'REORDER_DAY',
  'UPDATE_DAY',
  'DELETE_DAY',
  'ADD_SLOT',
  'UPDATE_ENTRY',
  'DELETE_SLOT',
  'REORDER_SLOT',
  'MOVE_SLOT',
  'MERGE_SLOTS_AS_PAIRED',
  'SPLIT_PAIRED_SLOT',
  'SAVE_GENERATED_DAY',
])

const HISTORY_LIMIT = 50

function routineSnapshot(state) {
  return { routines: state.routines, activeRoutineId: state.activeRoutineId }
}

/**
 * Wraps `reducer` with undo/redo over the routines slice only -- past/future
 * hold { routines, activeRoutineId } snapshots, never the full state. That
 * scoping is what makes it safe: a set logged (or a custom exercise added,
 * or a setting changed) between two routine edits lives in `present` and is
 * never written into a snapshot, so undoing a routine edit can't discard it.
 * `{ past, present, future }` is the reducer's state shape; callers persist
 * `present` only (see App.jsx's StoreProvider) -- the stacks are memory-only.
 */
export function historyReducer(historyState, action) {
  const { past, present, future } = historyState

  if (action.type === 'UNDO') {
    if (past.length === 0) return historyState
    const previous = past[past.length - 1]
    return {
      past: past.slice(0, -1),
      present: { ...present, ...previous },
      future: [routineSnapshot(present), ...future],
    }
  }

  if (action.type === 'REDO') {
    if (future.length === 0) return historyState
    const next = future[0]
    return {
      past: [...past, routineSnapshot(present)],
      present: { ...present, ...next },
      future: future.slice(1),
    }
  }

  const nextPresent = reducer(present, action)
  if (nextPresent === present) return historyState

  if (action.type === 'REPLACE_STATE') {
    return { past: [], present: nextPresent, future: [] }
  }

  if (!UNDOABLE_ACTION_TYPES.has(action.type)) {
    return { ...historyState, present: nextPresent }
  }

  return {
    past: [...past, routineSnapshot(present)].slice(-HISTORY_LIMIT),
    present: nextPresent,
    future: [],
  }
}

export function initHistoryState() {
  return { past: [], present: initState(), future: [] }
}
