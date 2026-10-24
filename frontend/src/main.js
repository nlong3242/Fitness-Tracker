import { state, findWorkout } from "./state.js";
import { fetchWorkouts, fetchUnfinishedSession } from "./api.js";
import { renderBottomNav, setActiveTab } from "./components/bottomNav.js";
import { initLiveWorkout } from "./components/liveWorkout.js";
import { startIdleWatch } from "./autoEnd.js";

// Pick up a workout left in progress (page reloaded, iOS closed the app...)
// so the home page can offer to resume it. Best-effort: skipped if this fails.
async function restoreInProgressSession() {
    try {
        const session = await fetchUnfinishedSession();
        if (session && findWorkout(session.workoutId)) {
            state.currentSessionId = session.id;
            state.currentSessionDate = session.date;
            state.currentWorkoutId = session.workoutId;
            state.currentLastActivityAt = session.lastActivityAt ? Date.parse(session.lastActivityAt) : null;
        }
    } catch (e) { /* keep going without it */ }
}

// Mirror the visual viewport into CSS so modal overlays (modals.css) fit
// the area above the iOS keyboard instead of the full screen behind it.
function trackVisualViewport() {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement.style;
    const sync = () => {
        root.setProperty("--vv-height", `${vv.height}px`);
        root.setProperty("--vv-top", `${vv.offsetTop}px`);
    };
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    sync();
}

async function bootstrap() {
    trackVisualViewport();
    state.workouts = await fetchWorkouts();
    await restoreInProgressSession();
    renderBottomNav();
    initLiveWorkout();
    setActiveTab("home");
    startIdleWatch();
}

bootstrap();
