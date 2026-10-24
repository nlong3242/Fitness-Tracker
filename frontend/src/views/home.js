import { setActiveTab, clearNavGuard } from "../components/bottomNav.js";
import { fetchOverview, fetchBodyWeightSummary, logBodyWeight } from "../api.js";
import { findWorkout } from "../state.js";
import { startWorkout } from "./activeWorkout.js";
import { liveWorkout } from "../components/liveWorkout.js";
import { renderBodyWeightPage } from "./bodyweight.js";
import { navigateToCalendarDay } from "./calendar.js";
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

export function renderHomePage() {
    clearNavGuard();
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <div class="home-hero">
            <h1 class="home-title">Tsu2Track</h1>
        </div>

        <button class="home-cta" id="home-start-btn">Start a Workout</button>

        <!-- Bodyweight is filled by loadBodyWeight(); Steps is still sample data. -->
        <div class="home-tile-row">
            <div class="home-tile tappable" id="home-weight-tile" role="button" tabindex="0" aria-label="Bodyweight history">
                <div class="home-tile-head">
                    <span class="home-tile-title">Bodyweight</span>
                    <span class="home-tile-badge" id="home-weight-badge" hidden></span>
                </div>
                <div class="home-tile-body">
                    ${SCALE}
                    <div class="home-tile-value"><span id="home-weight-value">–</span><input id="home-weight-input" class="home-weight-input" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" aria-label="Today's weight in kg" hidden><span class="home-tile-unit"> kg</span></div>
                </div>
                <div class="home-tile-trend" id="home-weight-trend" hidden></div>
                <div class="home-tile-note" id="home-weight-note" hidden></div>
                <button class="home-tile-error" type="button" id="home-weight-error" hidden>Not saved — tap to retry</button>
                <button class="home-tile-btn" type="button" id="home-log-weight-btn">Log Weight</button>
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
            <div class="home-stat" id="home-next-card">
                <div class="home-stat-label">Next up</div>
                <div class="home-stat-value" id="home-next-name">–</div>
                <div class="home-stat-sub" id="home-next-when"></div>
            </div>
            <div class="home-stat">
                <div class="home-stat-label">Streak</div>
                <div class="home-stat-value" id="home-streak">–</div>
                <div class="home-stat-sub" id="home-streak-note"></div>
            </div>
            <div class="home-stat">
                <div class="home-stat-label">This week</div>
                <div class="home-stat-value" id="home-week-count">–</div>
            </div>
            <div class="home-stat">
                <div class="home-stat-label">Last session</div>
                <div class="home-stat-value" id="home-last-name">–</div>
                <div class="home-stat-sub" id="home-last-when"></div>
            </div>
        </div>
    `;

    wireStartButton();
    wireWeightLogging();
    loadStats();
    loadBodyWeight();
}

// Latest summary, kept for the input's "last time" hint.
let weightSummary = null;

/* Inline logging, today only. Log Weight swaps the number for an empty
   input (last weight as a grey hint) with the keyboard up; tapping out or
   Return saves. Empty or not above 0 cancels, so a stray tap never logs
   anything. A failed save shows a retry line under the weight. */
function wireWeightLogging() {
    const valueEl = document.getElementById("home-weight-value");
    const input = document.getElementById("home-weight-input");
    const btn = document.getElementById("home-log-weight-btn");
    const errorBtn = document.getElementById("home-weight-error");
    let editing = false;
    let endedAt = 0;   // when editing last ended (see btn.onclick)
    let pendingKg = null;

    function startEditing() {
        editing = true;
        const last = weightSummary && weightSummary.latest;
        input.value = "";
        input.placeholder = last ? last.weightKg.toFixed(1) : "0.0";
        valueEl.hidden = true;
        input.hidden = false;
        btn.textContent = "Save";
        input.focus();   // inside the tap, so iOS opens the keyboard
    }

    function stopEditing() {
        editing = false;
        endedAt = Date.now();
        input.hidden = true;
        valueEl.hidden = false;
        btn.textContent = "Log Weight";
    }

    async function save(kg) {
        pendingKg = kg;
        valueEl.textContent = kg.toFixed(1);
        errorBtn.hidden = true;
        // The week's change belonged to the old number; it comes back with
        // the refreshed summary once this saves.
        document.getElementById("home-weight-trend").hidden = true;
        try {
            await logBodyWeight(localIso(new Date()), kg);
        } catch (e) {
            errorBtn.hidden = false;
            return;
        }
        pendingKg = null;
        loadBodyWeight();
    }

    btn.onclick = function() {
        // Tapping Save blurs the input first, which already saved; ignore the
        // click that follows rather than reopening the input.
        if (editing) { input.blur(); return; }
        if (Date.now() - endedAt < 400) return;
        startEditing();
    };

    input.onkeydown = function(e) {
        if (e.key === "Enter") input.blur();
        if (e.key === "Escape") { input.value = ""; input.blur(); }
    };

    input.onblur = function() {
        if (!editing) return;
        const kg = Number(input.value.trim().replace(",", "."));
        stopEditing();
        if (input.value.trim() && Number.isFinite(kg) && kg > 0) save(kg);
    };

    errorBtn.onclick = function() {
        if (pendingKg !== null) save(pendingKg);
    };

    // The rest of the tile opens the history page. Its own buttons and the
    // input keep their jobs, and a tap that just ended editing is ignored.
    const tile = document.getElementById("home-weight-tile");
    tile.onclick = function(e) {
        if (editing || e.target.closest("button, input")) return;
        if (Date.now() - endedAt < 400) return;
        renderBodyWeightPage();
    };
    tile.onkeydown = function(e) {
        if (e.target === tile && e.key === "Enter") renderBodyWeightPage();
    };
}

/* Fills the Bodyweight tile. Badge: TODAY / YESTERDAY / 2–3 DAYS AGO; from
   4 days old it's replaced by a "Last logged 24th Oct" note. Leaves the
   placeholders if the request fails or the tile is gone. */
async function loadBodyWeight() {
    let summary;
    try {
        summary = await fetchBodyWeightSummary(localIso(new Date()));
    } catch (e) {
        return;
    }
    const valueEl = document.getElementById("home-weight-value");
    if (!valueEl) return;
    weightSummary = summary;

    const badge = document.getElementById("home-weight-badge");
    const trend = document.getElementById("home-weight-trend");
    const note = document.getElementById("home-weight-note");
    badge.className = "home-tile-badge";
    badge.hidden = false;
    note.hidden = true;
    trend.hidden = true;

    const latest = summary.latest;
    if (!latest) {
        valueEl.textContent = "–";
        badge.textContent = "No log";
        return;
    }
    valueEl.textContent = latest.weightKg.toFixed(1);

    const days = daysBetween(latest.date, localIso(new Date()));
    if (days === 0) {
        badge.textContent = "Today";
        badge.classList.add("logged");
    } else if (days === 1) {
        badge.textContent = "Yesterday";
    } else if (days <= 3) {
        badge.textContent = `${days} days ago`;
    } else {
        badge.hidden = true;
        note.textContent = `Last logged ${ordinalDate(latest.date)}`;
        note.hidden = false;
    }

    const change = summary.weekChange;
    if (change !== null) {
        trend.className = "home-tile-trend" + (change < 0 ? " down" : "");
        trend.textContent = change === 0
            ? "No change this week"
            : `${change < 0 ? "▼" : "▲"} ${Math.abs(change).toFixed(1)} kg this week`;
        trend.hidden = false;
    }
}

/* Fills the stat cards. Leaves the "–" placeholders if the request fails or
   the user has already navigated away (the cards are no longer in the DOM). */
async function loadStats() {
    const today = localIso(new Date());
    let overview;
    try {
        overview = await fetchOverview(localIso(mondayOf(new Date())), today);
    } catch (e) {
        return;
    }
    const countEl = document.getElementById("home-week-count");
    if (!countEl) return;

    const n = overview.sessionsThisWeek;
    countEl.innerHTML = withUnit(n, n === 1 ? "session" : "sessions");

    // Older backends don't send these; leave the placeholders.
    if (overview.weekStreak !== undefined) {
        const weeks = overview.weekStreak;
        document.getElementById("home-streak").innerHTML = withUnit(weeks, weeks === 1 ? "week" : "weeks");
        document.getElementById("home-streak-note").textContent =
            n > 0 ? "This week done" : weeks > 0 ? "Train to keep it" : "Train to start one";
    }
    if (overview.nextPlanned !== undefined) showNextUp(overview.nextPlanned, overview.plannedThatDay || 0, today);

    const last = overview.lastSession;
    document.getElementById("home-last-name").textContent = last ? workoutName(last.workoutId) : "–";
    document.getElementById("home-last-when").textContent = last ? relativeDay(last.date, today) : "None yet";
}

/* The big button: "Resume <workout>" while one is open (in progress or
   started), otherwise "Start a Workout" → the workout list. showNextUp()
   may turn the latter into today's planned workout. */
function wireStartButton() {
    const btn = document.getElementById("home-start-btn");
    const live = liveWorkout();
    if (!live) {
        btn.onclick = function() { setActiveTab("workouts"); };
        return;
    }
    btn.textContent = `Resume ${live.name}`;
    btn.classList.add("live");
    btn.onclick = function() {
        startWorkout(live.id, { onComplete: function() { setActiveTab("home"); } });
    };
}

/* Next up card, plus the big button: with a plan for today it starts that
   workout (linked to the plan, so finishing marks it done on the calendar)
   instead of opening the workout list. Several plans on one day: the
   earliest-added comes first, with "+N more"; tapping the card opens that
   day in the calendar to pick another. */
function showNextUp(next, plannedThatDay, today) {
    const card = document.getElementById("home-next-card");
    const when = document.getElementById("home-next-when");
    if (!next) {
        document.getElementById("home-next-name").textContent = "–";
        when.textContent = "Nothing planned";
        return;
    }
    document.getElementById("home-next-name").textContent = workoutName(next.workoutId);
    const more = plannedThatDay - 1;
    when.textContent = relativeDay(next.date, today) + (more > 0 ? ` · +${more} more` : "");
    card.classList.add("tappable");
    card.setAttribute("role", "button");
    card.tabIndex = 0;
    card.onclick = function() { navigateToCalendarDay(next.date); };
    card.onkeydown = function(e) { if (e.key === "Enter") card.onclick(); };

    // An open workout keeps the button on Resume. Same rule as the
    // calendar's Start: the workout must have exercises.
    const workout = findWorkout(next.workoutId);
    if (liveWorkout() || next.date !== today || !workout || !(workout.exerciseCount > 0)) return;
    const startBtn = document.getElementById("home-start-btn");
    startBtn.textContent = `Start ${workout.name}`;
    startBtn.onclick = function() {
        startWorkout(workout.id, {
            scheduledWorkoutId: next.id,
            onComplete: function() { setActiveTab("home"); }
        });
    };
}

function workoutName(workoutId) {
    const workout = findWorkout(workoutId);
    return workout ? workout.name : "Workout";
}

// "3" big with a small "weeks" after it, like the tiles' kg.
function withUnit(n, unit) {
    return `${n}<span class="home-tile-unit"> ${unit}</span>`;
}

// "Today" / "Tomorrow" / "Yesterday", else "Thu 29 Oct" ahead or "25 Oct" back.
function relativeDay(yyyyMmDd, todayIso) {
    const days = daysBetween(todayIso, yyyyMmDd);
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    if (days === -1) return "Yesterday";
    if (days < 0) return shortDate(yyyyMmDd);
    const [y, m, d] = yyyyMmDd.split("-").map(Number);
    const weekday = new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short" });
    return `${weekday} ${shortDate(yyyyMmDd)}`;
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

// Whole calendar days from one YYYY-MM-DD to another.
function daysBetween(fromIso, toIso) {
    const [fy, fm, fd] = fromIso.split("-").map(Number);
    const [ty, tm, td] = toIso.split("-").map(Number);
    return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

// "24th Oct", with the year added when it isn't this year ("24th Oct 2025").
function ordinalDate(yyyyMmDd) {
    const [y, m, d] = yyyyMmDd.split("-").map(Number);
    const teen = d % 100 >= 11 && d % 100 <= 13;
    const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[d % 10] || "th");
    const month = new Date(y, m - 1, d).toLocaleDateString("en-GB", { month: "short" });
    return `${d}${suffix} ${month}` + (y !== new Date().getFullYear() ? ` ${y}` : "");
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
