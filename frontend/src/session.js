import { state, clearCurrentSession, findWorkout } from "./state.js";
import { showChoiceModal } from "./components/modals.js";
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
   anything else starts the clock now.
   planId: the calendar plan it was started from. Left out (undefined),
   reopening the same started workout keeps the plan it had. */
export function markWorkoutStarted(workoutId, startedAt, planId) {
    const started = readStarted();
    const same = started && started.workoutId === workoutId;
    if (!startedAt) startedAt = same && started.startedAt ? started.startedAt : Date.now();
    if (planId === undefined) planId = same && started.planId != null ? started.planId : null;
    startedInMemory = { workoutId, startedOn: localToday(), startedAt, planId };
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

/* The calendar plan the in-progress workout (workoutId) was started from,
   or null: the session's once it exists (kept on the server, so this holds
   after a reload or on another device), before that the started
   workout's on this device. */
export function workoutPlanId(workoutId) {
    if (state.currentSessionId !== null) {
        return state.currentWorkoutId === workoutId ? state.currentPlanId : null;
    }
    const started = readStarted();
    return started && started.workoutId === workoutId && started.planId != null ? started.planId : null;
}

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
        const mine = started && started.workoutId === workout.id;
        const startedAt = mine ? started.startedAt : null;
        const planId = mine && started.planId != null ? started.planId : null;
        const create = function() { return createSession(workout.id, startedAt, planId); };
        pendingSession = create()
            .catch(function(e) {
                if (e instanceof ApiError && e.status === 409 && e.inProgress) return resolveOtherInProgress(e.inProgress, create);
                throw e;
            })
            .then(function(session) {
                state.currentSessionId = session.id;
                state.currentSessionDate = session.date;
                state.currentWorkoutId = workout.id;
                state.currentLastActivityAt = Date.now();
                state.currentStartedAt = session.startedAt ? Date.parse(session.startedAt) : startedAt;
                state.currentPlanId = session.scheduledWorkoutId ?? planId;
                clearStartedWorkout(); // a real session supersedes it
                return session.id;
            })
            .finally(function() { pendingSession = null; });
    }
    return pendingSession;
}

/* The first set found another workout already in progress (the server
   allows one per account), started on another device this one didn't know
   about. Ask: go to that one, or discard it and log here. Resolves the
   session to log into; throws if the set shouldn't be saved here (Cancel,
   or gone to the other workout). */
async function resolveOtherInProgress(other, create) {
    const otherWorkout = findWorkout(other.workoutId);
    const name = otherWorkout ? otherWorkout.name : "Another workout";
    const choice = await showChoiceModal(`"${name}" is in progress on another device.`, [
        { label: `Go to ${name}`, value: "go" },
        { label: "Discard it & log here", value: "discard" }
    ]);
    if (choice === "discard") {
        const response = await deleteSession(other.id);
        if (!response.ok && response.status !== 404) throw new ApiError(response);
        return create();
    }
    if (choice === "go" && otherWorkout) {
        // That one becomes the workout in progress here too; open it.
        clearStartedWorkout();
        state.currentSessionId = other.id;
        state.currentSessionDate = other.date;
        state.currentWorkoutId = other.workoutId;
        state.currentLastActivityAt = other.lastActivityAt ? Date.parse(other.lastActivityAt) : Date.now();
        state.currentStartedAt = other.startedAt ? Date.parse(other.startedAt) : null;
        state.currentPlanId = other.scheduledWorkoutId ?? null;
        // (imported here: activeWorkout.js imports this file)
        const { startWorkout } = await import("./views/activeWorkout.js");
        const { setActiveTab } = await import("./components/bottomNav.js");
        startWorkout(other.workoutId, { onComplete: function() { setActiveTab("home"); } });
    }
    throw new Error("Another workout is in progress");
}

export async function maybeCleanupOrphanSession(workout) {
    const hasAnySets = workout.exercises.some(ex => ex.sets && ex.sets.length > 0);
    if (!hasAnySets && state.currentSessionId !== null) {
        const startedAt = state.currentStartedAt;
        const planId = state.currentPlanId;
        await deleteSession(state.currentSessionId);
        clearCurrentSession();
        // Still on the workout, just with nothing logged again; the
        // stopwatch keeps counting from the original Start, and it still
        // belongs to the plan it was started from.
        markWorkoutStarted(workout.id, startedAt, planId);
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
