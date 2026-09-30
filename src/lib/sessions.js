// Pure helpers over the sessions array. No React, no side effects.

function doneSets(entry) {
  return entry.sets.filter((s) => s.done)
}

/**
 * The most recent finished session (other than `excludeSessionId`) that
 * logged at least one done set of this exercise. Returns
 * { session, entry, sets } or null. This is the "last time" reference shown
 * while logging.
 */
export function lastSessionFor(sessions, exerciseId, { excludeSessionId } = {}) {
  const candidates = sessions
    .filter((s) => s.endedAt && s.id !== excludeSessionId)
    .filter((s) => s.entries.some((e) => e.exerciseId === exerciseId && doneSets(e).length > 0))
    .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))

  const session = candidates[0]
  if (!session) return null
  const entry = session.entries.find((e) => e.exerciseId === exerciseId && doneSets(e).length > 0)
  return { session, entry, sets: doneSets(entry) }
}

/** Sessions that started within the last `days` days, most recent first. */
export function sessionsInWindow(sessions, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return sessions
    .filter((s) => new Date(s.startedAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
}

/**
 * Flatten every done set across the given sessions into
 * { exerciseId, sets }-shaped entries -- the same shape coverage.js's
 * volumeForEntries expects, so logged history feeds straight into it.
 */
export function sessionSetCounts(sessions) {
  const counts = {}
  for (const session of sessions) {
    for (const entry of session.entries) {
      // Cooldown stretches (generated workouts) must not inflate volume.
      if (entry.kind === 'cooldown') continue
      const n = doneSets(entry).length
      if (n === 0) continue
      counts[entry.exerciseId] = (counts[entry.exerciseId] || 0) + n
    }
  }
  return Object.entries(counts).map(([exerciseId, sets]) => ({ exerciseId, sets }))
}

/** Epley estimated 1RM for one set. */
export function est1RM(weightKg, reps) {
  if (weightKg == null || !reps) return null
  return weightKg * (1 + reps / 30)
}

/** The done set with the highest estimated 1RM in an entry, or null. */
export function topSetOf(entry) {
  const sets = doneSets(entry)
  if (sets.length === 0) return null
  return sets.reduce((best, s) => {
    const e1 = est1RM(s.weightKg, s.reps) ?? -Infinity
    const bestE1 = best ? est1RM(best.weightKg, best.reps) ?? -Infinity : -Infinity
    return e1 > bestE1 ? s : best
  }, null)
}
