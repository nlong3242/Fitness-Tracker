import { state } from "./state.js";
import { createSession, deleteSession } from "./api.js";

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
        state.currentSessionId = null;
        state.currentSessionDate = null;
    }
}

/* Unconditional delete of the in-progress session — used when the user
   confirms "Abandon current workout?" from the nav guard. Unlike
   maybeCleanupOrphanSession, this destroys logged sets too. When the
   future resume feature lands, the nav-away path should preserve the
   session instead of calling this. */
export async function abandonSession() {
    if (state.currentSessionId !== null) {
        await deleteSession(state.currentSessionId);
        state.currentSessionId = null;
        state.currentSessionDate = null;
    }
}
