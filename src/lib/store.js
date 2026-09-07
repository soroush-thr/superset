// Persistence, reducer, and the sync seam. See BUILD-PLAN.md section 5.
//
// The four exports below (loadState, saveState, serialize, deserialize) are
// the entire persistence surface. A future sync adapter (section 13, item 3)
// swaps only these four; nothing else in the app should touch localStorage
// directly.
import { DEFAULT_TARGETS } from './constants.js'

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
      targets: {}, // only user overrides live here; defaults are seeded at read time (5.2)
    },
    routines: [],
    activeRoutineId: null,
  }
}

/** Section 5.2: seed settings.targets from DEFAULT_TARGETS for any sub-group
 *  the user hasn't overridden, without persisting the unchanged defaults. */
export function targetsWithDefaults(state) {
  return { ...DEFAULT_TARGETS, ...state.settings.targets }
}

/** JSON-serialize state for export, section 5.4. Adds exportedAt. */
export function serialize(state) {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString() })
}

/** Parse and validate a serialized state string. Throws on invalid JSON or
 *  an unsupported version; callers decide how to handle that. */
export function deserialize(text) {
  const parsed = JSON.parse(text)
  if (parsed.version !== 1) {
    throw new Error(`Unsupported state version: ${parsed.version}`)
  }
  return parsed
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

function uid(prefix) {
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
      const copy = { ...structuredClone(src), id: uid('r'), name: `${src.name} copy` }
      return { ...state, routines: [...state.routines, copy], activeRoutineId: copy.id }
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

    // "Make superset" / "Split" -- section 1a rule 1: stored type is
    // "paired", never "superset". UI label stays "Superset" (rule 2).
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

    default:
      return state
  }
}

export function initState() {
  return loadState()
}
