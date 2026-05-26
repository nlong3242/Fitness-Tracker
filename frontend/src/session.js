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
