import { fetchExerciseHistoryCount, resetExerciseHistory } from "../api.js";
import { showConfirmModal } from "./modals.js";

/* Reset exercise, from the exercise page's ⋮ and a live workout card's ⋮:
   deletes every set logged for it in finished workouts, in every workout
   (SessionService.resetExerciseHistory). Says how much first and always
   asks. todaysSets: sets logged for it in the workout being done, which
   stay (a workout in progress is left alone), so the question says so.
   True once it's reset. */
export async function resetExercise(exercise, todaysSets = 0) {
    let count;
    try {
        count = await fetchExerciseHistoryCount(exercise.id);
    } catch (e) {
        await showConfirmModal("Couldn't reset. Check your connection and try again.", "OK");
        return false;
    }
    if (count.sets === 0) {
        await showConfirmModal(`${exercise.name} has no history to reset.`, "OK");
        return false;
    }
    const what = count.sets === 1
        ? "The set you've logged for it is deleted"
        : `All ${count.sets} sets you've logged for it${count.sessions > 1 ? `, in ${count.sessions} workouts,` : ""} are deleted`;
    const today = todaysSets > 0 ? " Today's sets stay." : "";
    const confirmed = await showConfirmModal(`Reset ${exercise.name}? ${what}.${today} This can't be undone.`, "Reset");
    if (!confirmed) return false;
    try {
        await resetExerciseHistory(exercise.id);
    } catch (e) {
        await showConfirmModal("Couldn't reset. Check your connection and try again.", "OK");
        return false;
    }
    return true;
}
