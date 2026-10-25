import { findWorkout } from "./state.js";
import { fetchExercise } from "./api.js";
import { setActiveTab, highlightTab } from "./components/bottomNav.js";
import { liveWorkout } from "./components/liveWorkout.js";
import { renderBodyWeightPage } from "./views/bodyweight.js";
import { startWorkout } from "./views/activeWorkout.js";
import { viewWorkout } from "./views/workoutDetail.js";
import { viewPastSessions } from "./views/pastSessions.js";
import { viewSessionSummary } from "./views/summary.js";
import { navigateToCalendarDay, navigateToCalendarMonth } from "./views/calendar.js";
import { renderExerciseHistoryPage } from "./views/exerciseHistoryPage.js";

/* Hash routes, so a reload (or iOS restarting the Home Screen app) comes
   back to the same page instead of Home. Each page records where it is
   with setRoute() when it renders; restoreRoute() reopens it at startup.
   replaceState, not pushState: the address follows the page but no history
   entries pile up, and the in-app Back buttons keep working as before.

     #/home                                  #/bodyweight
     #/workouts                              #/workouts/12
     #/workouts/12/sessions                  #/workouts/12/sessions/345?date=2026-10-24
     #/workouts/12/exercises/7/history
     #/calendar/2026-10                      #/calendar/2026-10-25
     #/calendar/2026-10-25/sessions/345?workout=12
     #/exercises                             #/exercises/7/history
     #/live?exercise=55

   Pages holding unsaved state in memory (create workout, exercise picker,
   the live workout's review step) don't record a route, so a reload lands
   on the page they were opened from. After a reload, Back goes to the
   page's parent route; a deleted workout, session or exercise falls back
   to the nearest page that still exists. */

export function setRoute(path) {
    if (location.hash !== path) history.replaceState(null, "", path);
    rememberRoute();
}

/* A reload keeps the hash, but iOS starts a closed Home Screen app at the
   address it was added with (no hash). So the last route is also kept on
   the device and used when the app starts without one: always for an open
   workout (the router checks it's still open), otherwise only if the app
   was left within the last hour; after longer, Home is the better start. */
const LAST_ROUTE_KEY = "fitness.lastRoute";
const RESTORE_WITHIN_MS = 60 * 60 * 1000;

function rememberRoute() {
    try {
        localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify({ route: location.hash, at: Date.now() }));
    } catch (e) { /* private mode etc.: reloads still work via the hash */ }
}

// Refresh the timestamp when the app goes to the background.
document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "hidden" && location.hash) rememberRoute();
});

function savedRoute() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(LAST_ROUTE_KEY)); } catch (e) { return ""; }
    if (!saved || typeof saved.route !== "string") return "";
    if (saved.route.startsWith("#/live")) return saved.route;
    return Date.now() - saved.at < RESTORE_WITHIN_MS ? saved.route : "";
}

export async function restoreRoute() {
    if (!location.hash) {
        const saved = savedRoute();
        if (saved) history.replaceState(null, "", saved);
    }
    const [path, query] = location.hash.replace(/^#\/?/, "").split("?");
    const parts = path.split("/").filter(Boolean);
    const params = new URLSearchParams(query || "");
    try {
        if (await openRoute(parts, params)) return;
    } catch (e) { /* fall through to Home */ }
    setActiveTab("home");
}

const MONTH = /^\d{4}-\d{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function id(s) {
    return /^\d+$/.test(s || "") ? Number(s) : null;
}

// Returns true once a page is showing; false sends the caller to Home.
async function openRoute(parts, params) {
    switch (parts[0]) {
        case "bodyweight":
            highlightTab("home");
            await renderBodyWeightPage();
            return true;
        case "live":
            return openLive(params);
        case "workouts":
            return openWorkouts(parts, params);
        case "calendar":
            return openCalendar(parts, params);
        case "exercises":
            return openExercises(parts);
        default:
            return false;
    }
}

async function openLive(params) {
    const live = liveWorkout();
    if (!live) return false;
    await startWorkout(live.id, {
        exerciseId: id(params.get("exercise")),
        onComplete: function() { setActiveTab("home"); }
    });
    return true;
}

async function openWorkouts(parts, params) {
    const workoutId = id(parts[1]);
    if (workoutId === null || !findWorkout(workoutId)) {
        await setActiveTab("workouts");
        return true;
    }
    highlightTab("workouts");
    if (parts[2] === "sessions") {
        const sessionId = id(parts[3]);
        const date = params.get("date");
        if (sessionId !== null && DAY.test(date || "")) {
            try {
                await viewSessionSummary(workoutId, sessionId, date, function() { viewPastSessions(workoutId); });
                return true;
            } catch (e) { /* session deleted: show the list instead */ }
        }
        await viewPastSessions(workoutId);
        return true;
    }
    if (parts[2] === "exercises" && parts[4] === "history" && id(parts[3]) !== null) {
        const route = `#/workouts/${workoutId}/exercises/${parts[3]}/history`;
        try {
            const exercise = await fetchExercise(id(parts[3]));
            renderExerciseHistoryPage(exercise, function() { viewWorkout(workoutId); }, route);
            return true;
        } catch (e) { /* exercise gone: show the workout instead */ }
    }
    await viewWorkout(workoutId);
    return true;
}

async function openCalendar(parts, params) {
    const when = parts[1] || "";
    if (MONTH.test(when)) {
        const [y, m] = when.split("-").map(Number);
        await navigateToCalendarMonth(y, m - 1);
        return true;
    }
    if (!DAY.test(when)) {
        await setActiveTab("calendar");
        return true;
    }
    const sessionId = id(parts[3]);
    const workoutId = id(params.get("workout"));
    if (parts[2] === "sessions" && sessionId !== null && workoutId !== null && findWorkout(workoutId)) {
        highlightTab("calendar");
        try {
            await viewSessionSummary(workoutId, sessionId, when,
                function() { navigateToCalendarDay(when); },
                `#/calendar/${when}/sessions/${sessionId}?workout=${workoutId}`);
            return true;
        } catch (e) { /* session deleted: show the day instead */ }
    }
    await navigateToCalendarDay(when);
    return true;
}

async function openExercises(parts) {
    const exerciseId = id(parts[1]);
    if (exerciseId !== null && parts[2] === "history") {
        highlightTab("exercises");
        try {
            const exercise = await fetchExercise(exerciseId);
            renderExerciseHistoryPage(exercise, function() { setActiveTab("exercises"); },
                `#/exercises/${exerciseId}/history`);
            return true;
        } catch (e) { /* exercise gone: show the library instead */ }
    }
    await setActiveTab("exercises");
    return true;
}
