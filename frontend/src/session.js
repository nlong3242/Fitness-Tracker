import { state, clearCurrentSession } from "./state.js";
import { createSession, deleteSession, ApiError } from "./api.js";

/* "Started" workout: opened with Start but nothing logged yet, so no
   server session exists (sessions are created lazily on the first set).
   Remembered on the device only, until local midnight, so the resume bar
   can reopen it. Nothing is lost by dropping it, so it never prompts. */
const STARTED_KEY = "fitness.startedWorkout";

function localToday() {
    return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
}

export function markWorkoutStarted(workoutId) {
    try {
        localStorage.setItem(STARTED_KEY, JSON.stringify({ workoutId, startedOn: localToday() }));
    } catch (e) { /* storage unavailable: the bar just won't survive a reload */ }
    startedInMemory = { workoutId, startedOn: localToday() };
}

export function clearStartedWorkout() {
    startedInMemory = null;
    try { localStorage.removeItem(STARTED_KEY); } catch (e) { /* ignore */ }
}

// The started workout's id, or null if none / it was from an earlier day.
export function getStartedWorkoutId() {
    let started = startedInMemory;
    if (!started) {
        try { started = JSON.parse(localStorage.getItem(STARTED_KEY)); } catch (e) { started = null; }
    }
    if (!started || started.startedOn !== localToday()) {
        if (started) clearStartedWorkout();
        return null;
    }
    startedInMemory = started;
    return started.workoutId;
}

let startedInMemory = null;

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
                clearStartedWorkout(); // a real session supersedes it
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
        // Still on the workout, just with nothing logged again.
        markWorkoutStarted(workout.id);
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
