import { state, clearCurrentSession } from "./state.js";
import { createSession, deleteSession, ApiError } from "./api.js";

/* "Started" workout: opened with Start but nothing logged yet, so no
   server session exists (sessions are created lazily on the first set).
   Remembered on the device only, until local midnight, so the resume bar
   can reopen it. Nothing is lost by dropping it, so it never prompts.
   It also keeps startedAt, when Start was tapped: the stopwatch counts
   from it, and the session gets it when the first set creates it. */
const STARTED_KEY = "fitness.startedWorkout";

function localToday() {
    return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
}

/* startedAt: keep this time (an emptied session going back to "started");
   otherwise reopening the same started workout today keeps its time, and
   anything else starts the clock now. */
export function markWorkoutStarted(workoutId, startedAt) {
    if (!startedAt) {
        const started = readStarted();
        startedAt = started && started.workoutId === workoutId && started.startedAt
            ? started.startedAt : Date.now();
    }
    startedInMemory = { workoutId, startedOn: localToday(), startedAt };
    try {
        localStorage.setItem(STARTED_KEY, JSON.stringify(startedInMemory));
    } catch (e) { /* storage unavailable: the bar just won't survive a reload */ }
}

export function clearStartedWorkout() {
    startedInMemory = null;
    try { localStorage.removeItem(STARTED_KEY); } catch (e) { /* ignore */ }
}

// The started workout ({ workoutId, startedOn, startedAt }), or null if
// none / it was from an earlier day.
function readStarted() {
    let started = startedInMemory;
    if (!started) {
        try { started = JSON.parse(localStorage.getItem(STARTED_KEY)); } catch (e) { started = null; }
    }
    if (!started || started.startedOn !== localToday()) {
        if (started) clearStartedWorkout();
        return null;
    }
    startedInMemory = started;
    return started;
}

export function getStartedWorkoutId() {
    const started = readStarted();
    return started ? started.workoutId : null;
}

/* When the workout on screen began, for the stopwatch: the session's start
   once it exists, before that the started workout's. Null if unknown (a
   session from before the app recorded it). */
export function getWorkoutStartedAt(workoutId) {
    if (state.currentSessionId !== null) {
        return state.currentWorkoutId === workoutId ? state.currentStartedAt : null;
    }
    const started = readStarted();
    return started && started.workoutId === workoutId && started.startedAt ? started.startedAt : null;
}

let startedInMemory = null;

// A set was logged, edited or deleted (the server records the same).
export function touchActivity() {
    if (state.currentSessionId !== null) state.currentLastActivityAt = Date.now();
}

/* Two set rows can save at nearly the same moment (e.g. on a slow phone
   connection); both must land in one session. Callers arriving while the
   create is in flight share its promise instead of creating another. */
let pendingSession = null;

export async function ensureCurrentSession(workout) {
    if (state.currentSessionId !== null) return state.currentSessionId;
    if (!pendingSession) {
        const started = readStarted();
        const startedAt = started && started.workoutId === workout.id ? started.startedAt : null;
        pendingSession = createSession(workout.id, startedAt)
            .then(function(session) {
                state.currentSessionId = session.id;
                state.currentSessionDate = session.date;
                state.currentWorkoutId = workout.id;
                state.currentLastActivityAt = Date.now();
                state.currentStartedAt = session.startedAt ? Date.parse(session.startedAt) : startedAt;
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
        const startedAt = state.currentStartedAt;
        await deleteSession(state.currentSessionId);
        clearCurrentSession();
        // Still on the workout, just with nothing logged again; the
        // stopwatch keeps counting from the original Start.
        markWorkoutStarted(workout.id, startedAt);
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
