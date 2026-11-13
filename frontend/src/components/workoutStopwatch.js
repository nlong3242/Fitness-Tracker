import { state } from "../state.js";
import { getWorkoutStartedAt } from "../session.js";
import { formatDuration } from "../utils/format.js";

/* The live workout's stopwatch, right of "Name - Workout": how long since
   Start was tapped, counting up ("12:34", then "1:05:00"). It counts from a
   timestamp, so it stays right after a reload, the phone sleeping or iOS
   reopening the app. Hidden when turned off in Settings (the time is still
   recorded), or when the start is unknown (a session from before V19).
   One clock for the whole app; it stops once its element leaves the page. */

let shown = null; // { el, workoutId }
let ticker = null;

export function showWorkoutTimer() {
    return !state.profile || state.profile.showWorkoutTimer !== false;
}

export function mountWorkoutStopwatch(el, workoutId) {
    shown = { el, workoutId };
    tick();
    if (ticker === null) ticker = setInterval(tick, 500);
}

function tick() {
    if (!shown || !shown.el.isConnected) {
        shown = null;
        clearInterval(ticker);
        ticker = null;
        return;
    }
    const startedAt = getWorkoutStartedAt(shown.workoutId);
    const el = shown.el;
    el.hidden = !showWorkoutTimer() || !startedAt;
    if (el.hidden) return;
    const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const text = formatDuration(seconds);
    if (el.textContent !== text) {
        el.textContent = text;
        el.setAttribute("aria-label", `Workout time ${text}`);
    }
}
