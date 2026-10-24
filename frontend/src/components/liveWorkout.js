import { state, findWorkout } from "../state.js";
import { getStartedWorkoutId } from "../session.js";

/* "A workout is open" signals (they replaced the old Resume bar):
   - a glowing dot on the Home tab, on every page while a workout is open,
   - the home page's big button, which turns into "Resume <workout>"
     (home.js asks liveWorkout()).
   Open means either an in-progress session (sets logged; it lives on the
   server), or a workout that was started but has nothing logged yet
   (remembered on the device until midnight — see session.js).
   Views swap #app-content freely (often without going through
   setActiveTab), so a MutationObserver on it re-evaluates the dot after
   every navigation instead of each view having to remember to. */

export function initLiveWorkout() {
    const content = document.getElementById("app-content");
    new MutationObserver(updateLiveIndicator).observe(content, { childList: true });
    updateLiveIndicator();
}

// The workout that's open right now, or null.
export function liveWorkout() {
    if (state.currentSessionId !== null) return findWorkout(state.currentWorkoutId) || null;
    const startedId = getStartedWorkoutId();
    return startedId !== null ? findWorkout(startedId) || null : null;
}

export function updateLiveIndicator() {
    const homeTab = document.querySelector('#bottom-nav [data-tab="home"]');
    if (!homeTab) return;
    const live = liveWorkout();
    homeTab.classList.toggle("live", live !== null);
    homeTab.setAttribute("aria-label", live ? `Home, ${live.name} in progress` : "Home");
}
