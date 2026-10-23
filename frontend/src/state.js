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
}
