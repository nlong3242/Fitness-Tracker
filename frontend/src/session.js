import { state, clearCurrentSession } from "./state.js";
import { createSession, deleteSession, ApiError } from "./api.js";

/* Two set rows can save at nearly the same moment (e.g. on a slow phone
   connection); both must land in one session. Callers arriving while the
   create is in flight share its promise instead of creating another. */
let pendingSession = null;

export async function ensureCurrentSession(workout) {
    if (state.currentSessionId !== null) return state.currentSessionId;
    if (!pendingSession) {
        pendingSession = createSession(workout.id)
            .then(function(session) {
                state.currentSessionId = session.id;
                state.currentSessionDate = session.date;
                state.currentWorkoutId = workout.id;
                return session.id;
            })
            .finally(function() { pendingSession = null; });
    }
    return pendingSession;
}

export async function maybeCleanupOrphanSession(workout) {
    const hasAnySets = workout.exercises.some(ex => ex.sets && ex.sets.length > 0);
    if (!hasAnySets && state.currentSessionId !== null) {
        await deleteSession(state.currentSessionId);
        clearCurrentSession();
    }
}

/* Unconditional delete of the in-progress session — the live workout's
   Discard button. Unlike maybeCleanupOrphanSession, this destroys logged
   sets too. Throws (and keeps the session) if the delete fails, so a
   workout is never silently left half-discarded. */
export async function abandonSession() {
    if (state.currentSessionId !== null) {
        const response = await deleteSession(state.currentSessionId);
        if (!response.ok && response.status !== 404) throw new ApiError(response);
        clearCurrentSession();
    }
}
