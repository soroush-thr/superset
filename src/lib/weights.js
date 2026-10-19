// Weight choices for logging. Pure functions.
//
// Fixed-weight equipment (dumbbells, kettlebells) can be limited to the
// sizes the user actually owns (settings.ownedWeights, kg per equipment).
// Everything else gets a ladder in sensible plate/stack increments for the
// display unit. Values are always kg; only the ladders are built in the
// display unit so "22.5 kg" and "50 lb" land on round numbers.
import { fromDisplay, toDisplay } from './units.js'

export const OWNABLE_EQUIPMENT = ['dumbbell', 'kettlebells']

const range = (from, to, step) => {
  const out = []
  for (let v = from; v <= to + 1e-9; v += step) out.push(Math.round(v * 100) / 100)
  return out
}

/** The sizes offered when picking which weights you own, in display units. */
export const OWNABLE_SIZES = {
  dumbbell: {
    kg: [1, 2, 2.5, 3, 4, 5, 6, 7, 7.5, 8, 9, 10, 12, 12.5, 14, 15, 16, 17.5, 18, 20, 22.5, 24, 25, 27.5, 30, 32.5, 35, 37.5, 40, 42.5, 45, 50],
    lb: [2.5, 3, 5, 8, 10, 12, 15, 17.5, 20, 25, 30, 35, 40, 45, 50, 52.5, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100],
  },
  kettlebells: {
    kg: [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 44, 48],
    lb: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 53, 60, 62, 70, 80, 90, 97, 106],
  },
}

// Ladders in display units: [kg ladder, lb ladder].
const LADDERS = {
  dumbbell: [[...range(1, 10, 1), ...range(12.5, 60, 2.5)], [2.5, ...range(5, 150, 5)]],
  kettlebells: [range(4, 48, 2), range(5, 106, 5)],
  barbell: [range(0, 300, 2.5), range(0, 660, 5)],
  'e-z curl bar': [range(0, 100, 2.5), range(0, 220, 5)],
  machine: [range(2.5, 250, 2.5), range(5, 500, 5)],
  cable: [range(2.5, 120, 2.5), range(5, 260, 5)],
}
// Bodyweight-style moves: 0 = bodyweight only, then added load.
const ADDED_LADDER = [[0, ...range(2.5, 100, 2.5)], [0, ...range(5, 200, 5)]]

export function isBodyweight(equipment) {
  return !LADDERS[equipment]
}

/** Sorted kg list of the owned sizes for this equipment, or [] for "no limit". */
export function ownedFor(ownedWeights, equipment) {
  const list = ownedWeights?.[equipment]
  return Array.isArray(list) ? [...list].sort((a, b) => a - b) : []
}

/**
 * Weight options (kg) for an exercise's equipment: the owned sizes when the
 * user picked some, otherwise the unit's ladder. `current` (kg) is merged in
 * when it isn't already an option, so an odd logged value still shows.
 */
export function weightOptionsKg(equipment, unit, ownedWeights, current = null) {
  let owned = ownedFor(ownedWeights, equipment)
  // Added load on a bodyweight move is whatever dumbbell or kettlebell you
  // hold, so it offers those sizes too.
  if (isBodyweight(equipment)) {
    const held = OWNABLE_EQUIPMENT.flatMap((eq) => ownedFor(ownedWeights, eq))
    owned = held.length ? [0, ...held.filter((kg, i) => !held.slice(0, i).some((o) => sameWeight(o, kg)))].sort((a, b) => a - b) : []
  }
  let options
  if (owned.length) {
    options = owned
  } else {
    const ladder = (LADDERS[equipment] || ADDED_LADDER)[unit === 'lb' ? 1 : 0]
    options = ladder.map((v) => fromDisplay(v, unit))
  }
  if (current != null && !options.some((kg) => sameWeight(kg, current))) {
    options = [...options, current].sort((a, b) => a - b)
  }
  return options
}

export function sameWeight(a, b) {
  return a != null && b != null && Math.abs(a - b) < 0.01
}

/** Index of the option closest to `kg` (or -1 for an empty list). */
export function nearestIndex(options, kg) {
  let best = -1
  let bestD = Infinity
  options.forEach((v, i) => {
    const d = Math.abs(v - kg)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/** A weight label without the unit: "22.5", or "BW" for bodyweight-only. */
export function weightLabel(kg, unit, equipment) {
  if (kg == null) return '–'
  if (kg === 0 && isBodyweight(equipment)) return 'BW'
  const v = Math.round(toDisplay(kg, unit) * 10) / 10
  return isBodyweight(equipment) ? `+${v}` : String(v)
}

/** Store owned sizes picked in display units as kg. */
export function toggleOwned(ownedWeights, equipment, displayValue, unit) {
  const kg = Math.round(fromDisplay(displayValue, unit) * 1000) / 1000
  const list = ownedFor(ownedWeights, equipment)
  const next = list.some((v) => sameWeight(v, kg)) ? list.filter((v) => !sameWeight(v, kg)) : [...list, kg]
  return { ...(ownedWeights || {}), [equipment]: next.sort((a, b) => a - b) }
}
