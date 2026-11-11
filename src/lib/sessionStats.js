// Pure helpers that turn one finished session into the numbers its summary
// card shows. No React, no side effects. Everything here is derived from the
// sessions array on demand; nothing is persisted.
import { volumeForEntries } from './coverage.js'
import { est1RM, topSetOf } from './sessions.js'

const doneSets = (entry) => entry.sets.filter((s) => s.done)
const isLift = (entry) => entry.kind !== 'cooldown'

/**
 * Best previous marks for one exercise across every finished session that
 * started before `before` (ms). Returns { e1rm, reps } with nulls when the
 * exercise was never logged before -- a first-ever lift is not a record.
 */
function previousBests(sessions, exerciseId, before, excludeSessionId) {
  let e1rm = null
  let reps = null
  for (const s of sessions) {
    if (!s.endedAt || s.id === excludeSessionId) continue
    if (new Date(s.startedAt).getTime() >= before) continue
    for (const entry of s.entries) {
      if (entry.exerciseId !== exerciseId || !isLift(entry)) continue
      for (const set of doneSets(entry)) {
        const e = est1RM(set.weightKg, set.reps)
        if (e != null && (e1rm == null || e > e1rm)) e1rm = e
        if (set.reps != null && (reps == null || set.reps > reps)) reps = set.reps
      }
    }
  }
  return { e1rm, reps }
}

/**
 * Personal records set in `session`, one per exercise at most:
 *  - weighted lifts: the top set's estimated 1RM beats every earlier set's;
 *  - unweighted lifts: the most reps in one set beats every earlier set's.
 * Timed holds (targetUnit 'sec') and cooldown stretches are skipped.
 * Returns [{ exerciseId, kind: 'e1rm' | 'reps', weightKg, reps, gain }],
 * where `gain` is kg of estimated 1RM, or reps.
 */
export function sessionRecords(session, sessions) {
  const before = new Date(session.startedAt).getTime()
  const records = []
  const seen = new Set()
  for (const entry of session.entries) {
    if (!isLift(entry) || entry.targetUnit === 'sec' || seen.has(entry.exerciseId)) continue
    const sets = session.entries
      .filter((e) => e.exerciseId === entry.exerciseId && isLift(e))
      .flatMap(doneSets)
    if (sets.length === 0) continue
    seen.add(entry.exerciseId)
    const prev = previousBests(sessions, entry.exerciseId, before, session.id)

    const top = topSetOf({ sets })
    const topE1 = top ? est1RM(top.weightKg, top.reps) : null
    if (topE1 != null) {
      if (prev.e1rm != null && topE1 > prev.e1rm + 1e-6) {
        records.push({
          exerciseId: entry.exerciseId,
          kind: 'e1rm',
          weightKg: top.weightKg,
          reps: top.reps,
          gain: topE1 - prev.e1rm,
        })
      }
      continue
    }
    const bestReps = Math.max(...sets.map((s) => s.reps ?? 0))
    if (prev.reps != null && prev.e1rm == null && bestReps > prev.reps) {
      records.push({
        exerciseId: entry.exerciseId,
        kind: 'reps',
        weightKg: null,
        reps: bestReps,
        gain: bestReps - prev.reps,
      })
    }
  }
  return records
}

/**
 * Everything the summary card needs for one session:
 *  durationMs, sets, reps, exercises, volumeKg (sum of weight x reps over
 *  weighted done sets), muscles ({ subgroupId: set credit }, the shape
 *  BodyMap takes) and records (see sessionRecords).
 */
export function sessionSummary(session, sessions, exercisesById, creditMode = 'peak') {
  const end = session.endedAt ? new Date(session.endedAt).getTime() : Date.now()
  let sets = 0
  let reps = 0
  let volumeKg = 0
  const exerciseIds = new Set()
  const counts = []
  for (const entry of session.entries) {
    if (!isLift(entry)) continue
    const done = doneSets(entry)
    if (done.length === 0) continue
    exerciseIds.add(entry.exerciseId)
    counts.push({ exerciseId: entry.exerciseId, sets: done.length })
    sets += done.length
    if (entry.targetUnit === 'sec') continue
    for (const s of done) {
      reps += s.reps ?? 0
      if (s.weightKg != null && s.reps) volumeKg += s.weightKg * s.reps
    }
  }
  return {
    durationMs: Math.max(0, end - new Date(session.startedAt).getTime()),
    sets,
    reps,
    exercises: exerciseIds.size,
    volumeKg,
    muscles: volumeForEntries(counts, exercisesById, creditMode),
    records: sessionRecords(session, sessions),
  }
}
