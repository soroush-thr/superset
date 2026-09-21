// Single merged exercise registry: the built-in dataset plus any
// user-created custom exercises. Before this module, RoutineBuilder,
// Coverage, Library, and Settings each derived their own index from the raw
// JSON -- four sources of truth that a custom exercise would silently miss.
import exercisesData from '../data/exercises.json'

export const BUILTIN_EXERCISES = exercisesData
export const BUILTIN_BY_ID = Object.fromEntries(BUILTIN_EXERCISES.map((e) => [e.id, e]))

/**
 * Merge the built-in dataset with custom exercises into one { list, byId }.
 * `list` (for browsing/filtering) excludes soft-deleted custom exercises;
 * `byId` (for looking up an exercise a routine or session already
 * references) keeps them, so old routines and logged history can still
 * resolve a name after the exercise is "deleted".
 */
export function buildExerciseIndex(customExercises = []) {
  if (!customExercises || customExercises.length === 0) {
    return { list: BUILTIN_EXERCISES, byId: BUILTIN_BY_ID }
  }
  const visible = customExercises.filter((e) => !e.deleted)
  return {
    list: [...BUILTIN_EXERCISES, ...visible],
    byId: { ...BUILTIN_BY_ID, ...Object.fromEntries(customExercises.map((e) => [e.id, e])) },
  }
}

export function getExercise(id, index) {
  return index.byId[id]
}
