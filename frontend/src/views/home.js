import { setActiveTab, clearNavGuard } from "../components/bottomNav.js";
import { fetchOverview } from "../api.js";
import { findWorkout } from "../state.js";
import { pixelArt } from "../utils/pixelArt.js";

// Bathroom scale: rose platform, readout window with a needle, feet.
const SCALE = pixelArt([
    ".oooooooooooo.",
    "offffffffffffo",
    "offfoooooofffo",
    "offfodnndofffo",
    "offfoddddofffo",
    "offfoooooofffo",
    "offffffffffffo",
    "offffffffffffo",
    "osssssssssssso",
    ".oooooooooooo.",
    ".oo........oo.",
], { o: "#3B2723", f: "#E8B4A4", s: "#D29C8B", d: "#FFFDF8", n: "#B8665A" }, "home-tile-icon");

const SNEAKER = pixelArt([
    "....ooo.......",
    "...offo.......",
    "...offfoo.....",
    "..offwfffoo...",
    "..offwfffffoo.",
    ".offfffffffffo",
    "oooooooooooooo",
    "owwwwwwwwwwwwo",
    "oooooooooooooo",
], { o: "#3B2723", f: "#E8B4A4", w: "#FBF5EA" }, "home-tile-icon");

// Placeholder week of steps for the Steps tile (Mon..today) until step
// tracking exists.
const SAMPLE_STEPS = [5200, 6100, 7400, 11800, 5900, 4800, 6379];
const STEP_GOAL = 10000;

// Placeholder bodyweight: latest weigh-in and change over the week.
const SAMPLE_WEIGHT = { kg: 72.4, weekChange: -0.6 };

export function renderHomePage() {
    clearNavGuard();
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <div class="home-hero">
            <h2 class="home-title">Welcome to Tsu2Track</h2>
            <p class="home-tagline">Your personal fitness companion</p>
        </div>

        <button class="home-cta" id="home-start-btn">Start a Workout</button>

        <!-- Placeholder tiles: static sample content, no data behind them yet. -->
        <div class="home-tile-row">
            <div class="home-tile">
                <div class="home-tile-head">
                    <span class="home-tile-title">Bodyweight</span>
                    <span class="home-tile-badge logged">Today</span>
                </div>
                <div class="home-tile-body">
                    ${SCALE}
                    <div class="home-tile-value">${SAMPLE_WEIGHT.kg.toFixed(1)}<span class="home-tile-unit"> kg</span></div>
                </div>
                <div class="home-tile-trend ${SAMPLE_WEIGHT.weekChange < 0 ? "down" : "up"}">
                    ${SAMPLE_WEIGHT.weekChange < 0 ? "▼" : "▲"} ${Math.abs(SAMPLE_WEIGHT.weekChange).toFixed(1)} kg this week
                </div>
                <button class="home-tile-btn" type="button">Log Weight</button>
            </div>
            <div class="home-tile">
                <div class="home-tile-head">
                    <span class="home-tile-title">Steps</span>
                    <span class="home-tile-badge behind">Behind</span>
                </div>
                ${stepsTileBody()}
            </div>
        </div>

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

// Steps tile: today's progress bar, today's count, and a 7-day bar chart
// with a dashed line at the goal. Sample data for now.
function stepsTileBody() {
    const today = SAMPLE_STEPS[SAMPLE_STEPS.length - 1];
    const pct = Math.min(100, Math.round((today / STEP_GOAL) * 100));
    const top = Math.max(STEP_GOAL, ...SAMPLE_STEPS) * 1.05;
    const bars = SAMPLE_STEPS.map(n =>
        `<div class="home-steps-bar" style="height: ${Math.round((n / top) * 100)}%"></div>`).join("");
    return `
        <div class="home-tile-body">
            ${SNEAKER}
            <div class="home-tile-value">${today.toLocaleString("en-NZ")}<span class="home-tile-unit"> / ${STEP_GOAL.toLocaleString("en-NZ")}</span></div>
        </div>
        <div class="home-meter"><div class="home-meter-fill" style="width: ${pct}%"></div></div>
        <div class="home-steps-chart">
            <div class="home-steps-goal" style="bottom: ${Math.round((STEP_GOAL / top) * 100)}%"></div>
            ${bars}
        </div>
    `;
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
