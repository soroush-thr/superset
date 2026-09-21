// Weight unit conversion. Weights are always stored canonically in kg;
// these are the only functions that should convert to/from a display unit.
export const KG_PER_LB = 0.45359237

export function toDisplay(kg, unit) {
  if (kg == null) return kg
  return unit === 'lb' ? kg / KG_PER_LB : kg
}

export function fromDisplay(value, unit) {
  if (value == null) return value
  return unit === 'lb' ? value * KG_PER_LB : value
}

/** A sane plate increment, in kg, for the display unit (2.5 kg or 5 lb). */
export function incrementKgFor(unit) {
  return unit === 'lb' ? 5 * KG_PER_LB : 2.5
}

/** Round a kg weight to the nearest sane plate increment for the display unit. */
export function roundToIncrement(kg, unit) {
  if (kg == null) return kg
  const incrementKg = incrementKgFor(unit)
  return Math.round(kg / incrementKg) * incrementKg
}

export function formatWeight(kg, unit) {
  if (kg == null) return '—'
  const value = toDisplay(kg, unit)
  const rounded = Math.round(value * 10) / 10
  return `${rounded} ${unit}`
}
