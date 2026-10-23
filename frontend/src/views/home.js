import { setActiveTab, clearNavGuard } from "../components/bottomNav.js";
import { fetchOverview } from "../api.js";
import { findWorkout } from "../state.js";

export function renderHomePage() {
    clearNavGuard();
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <div class="home-hero">
            <h2 class="home-title">Welcome to Tsu2Track</h2>
            <p class="home-tagline">Your personal fitness companion</p>
        </div>

        <button class="home-cta" id="home-start-btn">Start a Workout</button>

        <div class="home-stat-row">
            <div class="home-stat">
                <div class="home-stat-value" id="home-week-count">–</div>
                <div class="home-stat-label" id="home-week-label">Sessions this week</div>
            </div>
            <div class="home-stat">
                <div class="home-stat-value" id="home-last-name">–</div>
                <div class="home-stat-label" id="home-last-label">Last session</div>
            </div>
        </div>
    `;

    document.getElementById("home-start-btn").onclick = function() { setActiveTab("workouts"); };
    loadStats();
}

/* Fills the stat cards. Leaves the "–" placeholders if the request fails or
   the user has already navigated away (the cards are no longer in the DOM). */
async function loadStats() {
    let overview;
    try {
        overview = await fetchOverview(localIso(mondayOf(new Date())));
    } catch (e) {
        return;
    }
    const countEl = document.getElementById("home-week-count");
    if (!countEl) return;

    const n = overview.sessionsThisWeek;
    countEl.textContent = String(n);
    document.getElementById("home-week-label").textContent =
        n === 1 ? "Session this week" : "Sessions this week";

    const last = overview.lastSession;
    const nameEl = document.getElementById("home-last-name");
    const labelEl = document.getElementById("home-last-label");
    if (!last) {
        nameEl.textContent = "–";
        labelEl.textContent = "No sessions yet";
        return;
    }
    const workout = findWorkout(last.workoutId);
    nameEl.textContent = workout ? workout.name : "Workout";
    labelEl.textContent = `Last session · ${shortDate(last.date)}`;
}

// Monday-start weeks, matching the calendar view.
function mondayOf(d) {
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return monday;
}

function localIso(d) {
    return d.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
}

// "24 Oct", with the year added when it isn't this year ("24 Oct 2025").
function shortDate(yyyyMmDd) {
    const [y, m, d] = yyyyMmDd.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const opts = { day: "numeric", month: "short" };
    if (y !== new Date().getFullYear()) opts.year = "numeric";
    return date.toLocaleDateString("en-GB", opts);
}
