import { state } from "./state.js";
import { createSession, deleteSession } from "./api.js";

export async function ensureCurrentSession(workout) {
    if (state.currentSessionId === null) {
        const session = await createSession(workout.id);
        state.currentSessionId = session.id;
        state.currentSessionDate = session.date;
    }
    return state.currentSessionId;
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
