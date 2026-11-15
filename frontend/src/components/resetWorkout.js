import { fetchWorkoutHistoryCount, resetWorkoutHistory } from "../api.js";
import { state } from "../state.js";
import { getStartedWorkoutId } from "../session.js";
import { showConfirmModal } from "./modals.js";

/* Reset workout, from the workout's ⋮ (list and page) and the live
   workout's ⋮: deletes every finished session of it, with its sets
   (SessionService.resetWorkoutHistory); the workout, its exercises and its
   repeat stay, and so does one being done right now, which the question
   then mentions. Says how much first and always asks. True once it's
   reset. */
export async function resetWorkout(workout) {
    let count;
    try {
        count = await fetchWorkoutHistoryCount(workout.id);
    } catch (e) {
        await showConfirmModal("Couldn't reset. Check your connection and try again.", "OK");
        return false;
    }
    if (count.sessions === 0) {
        await showConfirmModal(`${workout.name} has no history to reset.`, "OK");
        return false;
    }
    const sets = count.sets === 1 ? "1 set" : `${count.sets} sets`;
    const what = count.sessions === 1
        ? `The workout you've done of it is deleted, with its ${sets}`
        : `All ${count.sessions} workouts you've done of it are deleted, with their ${sets}`;
    const inProgress = state.currentWorkoutId === workout.id || getStartedWorkoutId() === workout.id
        ? " Today's sets stay." : "";
    const confirmed = await showConfirmModal(
        `Reset ${workout.name}? ${what}.${inProgress} This can't be undone.`, "Reset");
    if (!confirmed) return false;
    try {
        await resetWorkoutHistory(workout.id);
    } catch (e) {
        await showConfirmModal("Couldn't reset. Check your connection and try again.", "OK");
        return false;
    }
    return true;
}
