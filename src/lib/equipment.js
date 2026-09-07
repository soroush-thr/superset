// Equipment-profile helpers shared by Library and Coverage. Section 5.1
// only stores "home" and "gym" as real profiles in settings.equipmentProfiles
// -- "all" is a virtual third option meaning no restriction at all, so it
// has to be derived from the data rather than looked up.
import exercises from '../data/exercises.json'

export const ALL_EQUIPMENT = [...new Set(exercises.map((e) => e.equipment))].sort()

export function equipmentOptionsFor(equipmentProfiles, activeProfile) {
  return activeProfile === 'all' ? ALL_EQUIPMENT : equipmentProfiles[activeProfile]
}
