// Equipment-profile helpers shared by Library, RoutineBuilder, and
// Coverage. Section 5.1 only stores "home" and "gym" as real profiles in
// settings.equipmentProfiles -- "all" is a virtual third option meaning no
// restriction at all, so it has to be derived from the data rather than
// looked up.
import exercises from '../data/exercises.json'

export const BUILTIN_EQUIPMENT = [...new Set(exercises.map((e) => e.equipment))].sort()

/** BUILTIN_EQUIPMENT widened with any equipment custom exercises introduce,
 *  so a custom exercise using novel equipment isn't unreachable behind the
 *  "all" filter. */
export function allEquipment(customExercises = []) {
  if (!customExercises || customExercises.length === 0) return BUILTIN_EQUIPMENT
  const custom = customExercises.filter((e) => !e.deleted).map((e) => e.equipment)
  return [...new Set([...BUILTIN_EQUIPMENT, ...custom])].sort()
}

export function equipmentOptionsFor(equipmentProfiles, activeProfile, allEquipmentList = BUILTIN_EQUIPMENT) {
  return activeProfile === 'all' ? allEquipmentList : equipmentProfiles[activeProfile]
}
