import { state, findWorkout } from "../state.js";
import { escapeHtml, formatSessionDate } from "../utils/format.js";
import { setActiveTab } from "./bottomNav.js";
import { startWorkout } from "../views/activeWorkout.js";

/* "Workout in progress — Resume" bar, fixed above the bottom nav.
   Shown on every page while a session is in progress, except the live
   workout itself. Views swap #app-content freely (often without going
   through setActiveTab), so a MutationObserver on it re-evaluates the bar
   after every navigation instead of each view having to remember to. */

export function initResumeBanner() {
    const content = document.getElementById("app-content");
    new MutationObserver(updateResumeBanner).observe(content, { childList: true });
    wireBanner(document.getElementById("resume-banner"));
    updateResumeBanner();
}

export function updateResumeBanner() {
    const banner = document.getElementById("resume-banner");
    const onLiveWorkout = document.getElementById("exercise-cards") !== null;
    const workout = state.currentSessionId !== null ? findWorkout(state.currentWorkoutId) : null;
    const visible = workout != null && !onLiveWorkout;

    banner.hidden = !visible;
    document.body.classList.toggle("has-resume-banner", visible);
    if (!visible) return;

    const todayIso = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
    const started = state.currentSessionDate === todayIso
        ? "Started today"
        : `Started ${formatSessionDate(state.currentSessionDate)}`;
    banner.innerHTML = `
        <span class="resume-dot" aria-hidden="true"></span>
        <div class="resume-text">
            <div class="resume-title">${escapeHtml(workout.name)} in progress</div>
            <div class="resume-sub">${escapeHtml(started)}</div>
        </div>
        <span class="resume-btn" aria-hidden="true">Resume &#8250;</span>
    `;
}

// The whole bar is the tap target ("Resume" is just a visual cue).
async function resume() {
    // Highlight the Workouts tab, then replace its list with the workout.
    await setActiveTab("workouts");
    startWorkout(state.currentWorkoutId);
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
