import { state, findWorkout, clearCurrentSession } from "./state.js";
import { finishSession } from "./api.js";
import { clearStartedWorkout } from "./session.js";
import { clearDrafts } from "./drafts.js";
import { syncCalendarOnFinish } from "./views/activeWorkout.js";
import { setActiveTab } from "./components/bottomNav.js";
import { updateResumeBanner } from "./components/resumeBanner.js";
import { showConfirmModal } from "./components/modals.js";

/* Idle auto-end: a workout with no set logged, edited or deleted for
   IDLE_LIMIT is finished exactly as the Finish button would (same calendar
   entry, on the session's own date). A web page can't run while closed, so
   this runs when the app opens, every minute while it's open, and whenever
   it comes back to the foreground; the user is told when it happens. */

const IDLE_LIMIT_MS = 5 * 60 * 60 * 1000;
const CHECK_EVERY_MS = 60 * 1000;

let ending = false;

export async function endIdleWorkout() {
    if (ending || state.currentSessionId === null || state.currentLastActivityAt === null) return;
    if (Date.now() - state.currentLastActivityAt < IDLE_LIMIT_MS) return;

    ending = true;
    const sessionId = state.currentSessionId;
    const sessionDate = state.currentSessionDate;
    const workoutId = state.currentWorkoutId;
    try {
        // null order: the server uses the workout's own exercise order.
        await finishSession(sessionId, null);
    } catch (e) {
        ending = false; // offline etc.: still in progress, try again next check
        return;
    }
    await syncCalendarOnFinish(workoutId, sessionId, sessionDate, null);
    clearCurrentSession();
    clearStartedWorkout();
    clearDrafts();

    // Don't leave the user on a live workout that no longer exists.
    if (document.getElementById("exercise-cards") !== null) await setActiveTab("home");
    else updateResumeBanner();

    const workout = findWorkout(workoutId);
    const name = workout ? workout.name : "Your workout";
    await showConfirmModal(
        `${name} was ended automatically — nothing was logged for 5 hours. Your sets are saved.`,
        "OK"
    );
    ending = false;
}

export function startIdleWatch() {
    endIdleWorkout();
    setInterval(endIdleWorkout, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", function() {
        if (!document.hidden) endIdleWorkout();
    });
}
