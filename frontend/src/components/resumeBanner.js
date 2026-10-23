import { state, findWorkout } from "../state.js";
import { getStartedWorkoutId } from "../session.js";
import { escapeHtml, formatSessionDate } from "../utils/format.js";
import { setActiveTab } from "./bottomNav.js";
import { startWorkout } from "../views/activeWorkout.js";

/* "Workout in progress — Resume" bar, fixed above the bottom nav.
   Shown on every page while a workout is open, except the live workout
   itself, for either:
   - an in-progress session (sets logged; it lives on the server), or
   - a workout that was started but has nothing logged yet (remembered on
     the device until midnight — see session.js).
   Views swap #app-content freely (often without going through
   setActiveTab), so a MutationObserver on it re-evaluates the bar after
   every navigation instead of each view having to remember to. */

export function initResumeBanner() {
    const content = document.getElementById("app-content");
    new MutationObserver(updateResumeBanner).observe(content, { childList: true });
    wireBanner(document.getElementById("resume-banner"));
    updateResumeBanner();
}

// What the bar points at right now, or null.
function currentTarget() {
    if (state.currentSessionId !== null) {
        const workout = findWorkout(state.currentWorkoutId);
        if (!workout) return null;
        const todayIso = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
        const started = state.currentSessionDate === todayIso
            ? "Started today"
            : `Started ${formatSessionDate(state.currentSessionDate)}`;
        return { workout, title: `${workout.name} in progress`, sub: started, pending: false };
    }
    const startedId = getStartedWorkoutId();
    const workout = startedId !== null ? findWorkout(startedId) : null;
    if (!workout) return null;
    return { workout, title: `${workout.name} started`, sub: "No sets logged yet", pending: true };
}

export function updateResumeBanner() {
    const banner = document.getElementById("resume-banner");
    const onLiveWorkout = document.getElementById("exercise-cards") !== null;
    const target = onLiveWorkout ? null : currentTarget();

    banner.hidden = target === null;
    document.body.classList.toggle("has-resume-banner", target !== null);
    if (target === null) return;

    banner.dataset.workoutId = target.workout.id;
    banner.classList.toggle("pending", target.pending);
    banner.innerHTML = `
        <span class="resume-dot" aria-hidden="true"></span>
        <div class="resume-text">
            <div class="resume-title">${escapeHtml(target.title)}</div>
            <div class="resume-sub">${escapeHtml(target.sub)}</div>
        </div>
        <span class="resume-btn" aria-hidden="true">Resume &#8250;</span>
    `;
}

// The whole bar is the tap target ("Resume" is just a visual cue).
async function resume() {
    const workoutId = Number(document.getElementById("resume-banner").dataset.workoutId);
    // Highlight the Workouts tab, then replace its list with the workout.
    await setActiveTab("workouts");
    startWorkout(workoutId);
}

function wireBanner(banner) {
    banner.setAttribute("role", "button");
    banner.setAttribute("tabindex", "0");
    banner.setAttribute("aria-label", "Resume workout in progress");
    banner.onclick = resume;
    banner.onkeydown = function(e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); resume(); }
    };
}
