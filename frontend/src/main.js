import { state, findWorkout } from "./state.js";
import { fetchWorkouts, fetchUnfinishedSession, fetchMe, fetchProfile, setUnauthorizedHandler, ApiError } from "./api.js";
import { getToken } from "./auth.js";
import { renderBottomNav } from "./components/bottomNav.js";
import { renderLoginPage } from "./views/login.js";
import { showProfileSetup } from "./views/profile.js";
import { restoreRoute } from "./router.js";
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

/* A login ended elsewhere (Log out everywhere, a password change on another
   device) only shows up on this device's next request. So ask the server
   when the app comes back on screen: a refused login brings up the login
   page at once (setUnauthorizedHandler), before the user taps anything.
   At most every 30 s; offline, nothing happens. */
const LOGIN_CHECK_EVERY_MS = 30 * 1000;
let lastLoginCheck = Date.now();

function checkLoginWhenShown() {
    document.addEventListener("visibilitychange", function() {
        if (document.visibilityState !== "visible" || !getToken()) return;
        if (document.getElementById("auth-screen")) return;
        if (Date.now() - lastLoginCheck < LOGIN_CHECK_EVERY_MS) return;
        lastLoginCheck = Date.now();
        fetchMe().catch(function() { /* 401 handled in api.js; offline: try next time */ });
    });
}

async function bootstrap() {
    trackVisualViewport();
    // No login, or the server turned the token down: the login page, which
    // reloads the app once someone logs in.
    setUnauthorizedHandler(renderLoginPage);
    if (!getToken()) {
        renderLoginPage();
        return;
    }
    try {
        state.workouts = await fetchWorkouts();
    } catch (e) {
        if (e instanceof ApiError && e.status === 401) return;   // login page is up
        throw e;
    }
    // No profile yet (new account, or one from before profiles): the set-up
    // page goes over the app until it's saved. If this can't be checked
    // (offline), ask next start.
    let needsProfile = false;
    try {
        state.profile = await fetchProfile();
        needsProfile = state.profile === null;
    } catch (e) { /* keep going without it */ }
    await restoreInProgressSession();
    renderBottomNav();
    initLiveWorkout();
    await restoreRoute();
    if (needsProfile) showProfileSetup();
    startIdleWatch();
    checkLoginWhenShown();
}

bootstrap();
