export const state = {
    workouts: [],
    // The in-progress (started, unfinished) session, if any. It outlives the
    // live-workout page: leaving keeps it, and the resume bar offers it back.
    currentSessionId: null,
    currentSessionDate: null,
    currentWorkoutId: null,
    // ms timestamp of the last set change in that session (server-side
    // Session.lastActivityAt, kept current locally); drives idle auto-end.
    currentLastActivityAt: null,
    // ms timestamp when that session's Start was tapped (server startedAt);
    // the live stopwatch counts from it. Null for sessions from before V19.
    currentStartedAt: null,
    // The calendar plan that session was started from (server
    // scheduledWorkoutId), so Finish ticks it off even after a resume.
    currentPlanId: null,
    // { name, birthDate, heightCm, weeklyGoal, restSeconds, showWorkoutTimer } from GET
    // /profile; null until the account has one (main.js then shows the
    // set-up page).
    profile: null,
};

// Views navigate by workout id, not array position: positions shift when
// a workout is deleted or state.workouts is refetched.
export function findWorkout(workoutId) {
    return state.workouts.find(w => w.id === workoutId);
}

export function clearCurrentSession() {
    state.currentSessionId = null;
    state.currentSessionDate = null;
    state.currentWorkoutId = null;
    state.currentLastActivityAt = null;
    state.currentStartedAt = null;
    state.currentPlanId = null;
}
