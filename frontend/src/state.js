export const state = {
    workouts: [],
    currentSessionId: null,
    currentSessionDate: null,
};

// Views navigate by workout id, not array position: positions shift when
// a workout is deleted or state.workouts is refetched.
export function findWorkout(workoutId) {
    return state.workouts.find(w => w.id === workoutId);
}
