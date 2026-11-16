import { setActiveTab, clearNavGuard, highlightTab } from "../components/bottomNav.js";
import { fetchOverview, fetchWeek, fetchBodyWeightSummary, logBodyWeight, fetchSessionSets, fetchExercise } from "../api.js";
import { state, findWorkout } from "../state.js";
import { startWorkout } from "./activeWorkout.js";
import { liveWorkout } from "../components/liveWorkout.js";
import { renderBodyWeightPage } from "./bodyweight.js";
import { renderSettingsPage } from "./settings.js";
import { navigateToCalendarDay } from "./calendar.js";
import { viewSessionSummary, sessionSummaryRoute } from "./summary.js";
import { getWorkoutStartedAt } from "../session.js";
import { renderExercisePage } from "./exercisePage.js";
import { formatDuration } from "../utils/format.js";
import { pixelArt } from "../utils/pixelArt.js";
import { setRoute } from "../router.js";

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

// Settings: a line gear in the tab bar icons' style, 8 squared teeth
// round a ring with a hole in the middle, drawn from points so it's even.
const GEAR = (() => {
    const pts = [];
    for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        for (const [da, r] of [[-0.30, 7.2], [-0.20, 9.6], [0.20, 9.6], [0.30, 7.2]]) {
            pts.push([12 + r * Math.cos(a + da), 12 + r * Math.sin(a + da)].map(n => n.toFixed(2)).join(" "));
        }
    }
    return `<svg class="home-gear" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M${pts.join(" L")} Z"/><circle cx="12" cy="12" r="3"/></svg>`;
})();

// A soft sprig after the wordmark: two round pink buds and sage leaves,
// edged in darker pink and green rather than the dark outline. Drawn
// leaning left, towards the wordmark.
const SPRIG = pixelArt([
    "......rrr...",
    ".....rPPpr..",
    ".....rPppr..",
    "......rrr...",
    ".rrr...s....",
    "rPPpr..s....",
    "rPppr.s.....",
    ".rrrsssLL...",
    "......sLlL..",
    ".LL..s.LlL..",
    "LlLLs...LL..",
    ".LlLs.......",
    "..LLs.LL....",
    "....sLlLL...",
    "....s.LL....",
    "....s.......",
].map(row => [...row].reverse().join("")),
{ r: "#C98275", P: "#F6D3CB", p: "#E8A99C", l: "#A9C795", L: "#6E9460", s: "#6E9460" }, "home-sprig");

// The streak's flame.
const FLAME = pixelArt([
    "...o....",
    "..ofo...",
    "..offo..",
    ".offfo.o",
    ".offyfoo",
    "offyyffo",
    "ofyyyyfo",
    "offyyffo",
    ".oooooo.",
], { o: "#3B2723", f: "#D29C8B", y: "#F8E0D7" }, "home-flame");

// The card's heading icon.
const DUMBBELL = pixelArt([
    ".oo........oo.",
    "offo......offo",
    "offooooooooffo",
    "offffffffffffo",
    "offooooooooffo",
    "offo......offo",
    ".oo........oo.",
], { o: "#3B2723", f: "#E8B4A4" }, "home-card-icon");

// Latest PR: rose cup with handles, a highlight, stem and base.
const TROPHY = pixelArt([
    "..oooooooooo..",
    "ooooffffffoooo",
    "o..offffffo..o",
    "o..offwfffo..o",
    ".o.offwfffo.o.",
    "..ooffffffoo..",
    "....offffo....",
    ".....offo.....",
    ".....offo.....",
    "...oooooooo...",
    "...offffffo...",
    "...oooooooo...",
], { o: "#3B2723", f: "#E8B4A4", w: "#FFFDF8" }, "home-row-icon");

// Last session: a calendar page, rose header with two rings, sage tick.
const CAL_DONE = pixelArt(grid(14, 12, set => {
    for (let x = 0; x < 14; x++) { set(x, 1, "o"); set(x, 4, "o"); set(x, 11, "o"); }
    for (let y = 1; y < 12; y++) { set(0, y, "o"); set(13, y, "o"); }
    for (let y = 2; y <= 3; y++) for (let x = 1; x <= 12; x++) set(x, y, "r");
    for (let y = 5; y <= 10; y++) for (let x = 1; x <= 12; x++) set(x, y, "c");
    for (const x of [3, 10]) { set(x, 0, "o"); set(x, 2, "o"); }
    for (const [x, y] of [[3, 7], [4, 8], [5, 9], [6, 8], [7, 7], [8, 6], [9, 5]]) {
        set(x, y, "g");
        if (y + 1 <= 10) set(x, y + 1, "g");
    }
}), { o: "#3B2723", r: "#E8B4A4", c: "#FFFDF8", g: "#3F6E38" }, "home-row-icon");

// A w × h pixel grid painted by set(x, y, colourKey), as pixelArt rows.
function grid(w, h, paint) {
    const g = Array.from({ length: h }, () => Array(w).fill("."));
    paint((x, y, c) => { g[y][x] = c; });
    return g.map(row => row.join(""));
}

// The tick on a done day's badge.
const CHECK = `<svg class="home-check" viewBox="0 0 10 8" aria-hidden="true"><path d="M1 4l3 3 5-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/></svg>`;

// Placeholder week of steps for the Steps tile (Mon..today) until step
// tracking exists.
const SAMPLE_STEPS = [5200, 6100, 7400, 11800, 5900, 4800, 6379];
const STEP_GOAL = 10000;

/* Home starts on today (the Home tab, opening the app, a new day). Back
   from a page opened on Home (a summary, an exercise's History, the
   Bodyweight page) comes back to the day that was selected instead, even
   after a reload there: the day is kept for this tab's session (cleared
   when the app is closed) and only counts on the day it was picked.
   opts.keepDay: come back to it (backToHome). */
export function renderHomePage(opts) {
    clearNavGuard();
    setRoute("#/home");
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <header class="home-top">
            <span class="home-brand"><h1 class="home-title">Tsu2Track</h1>${SPRIG}</span>
            <button type="button" class="home-settings-btn" id="home-settings-btn" aria-label="Settings">${GEAR}</button>
        </header>

        <!-- "Hi, name", and the selected day with Today (faded while on today). -->
        <div class="home-greeting-row">
            <span class="home-greeting" id="home-greeting"></span>
            <span class="home-sel">
                <span class="home-sel-date" id="home-sel-date"></span>
                <button type="button" class="home-today-btn here" id="home-today-btn">Today</button>
            </span>
        </div>

        <!-- Week strip: tap a day to select it; arrows or a swipe step a week. -->
        <section class="home-week" aria-label="Week">
            <div class="home-strip" id="home-strip">
                <button type="button" class="home-week-arrow" id="home-week-prev" aria-label="Previous week">&#8249;</button>
                <div class="home-days" id="home-days"></div>
                <button type="button" class="home-week-arrow" id="home-week-next" aria-label="Next week">&#8250;</button>
            </div>
            <div class="home-week-foot" id="home-week-foot"></div>
        </section>

        <!-- The selected day: what to start, resume or look back at. -->
        <section class="home-card" id="home-day-card" aria-live="polite"></section>

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

        <!-- Latest PR → that exercise's History tab; Last session → its
             summary. Filled by loadStats(); no › until there's something. -->
        <button type="button" class="home-row none" id="home-pr-row" disabled>
            <span class="home-row-badge">${TROPHY}</span>
            <span class="home-row-text">
                <span class="home-row-label" id="home-pr-label">Latest PR</span>
                <span class="home-row-value" id="home-pr-value">–</span>
            </span>
            <span class="home-chevron" aria-hidden="true">&#8250;</span>
        </button>
        <button type="button" class="home-row none" id="home-last-row" disabled>
            <span class="home-row-badge">${CAL_DONE}</span>
            <span class="home-row-text">
                <span class="home-row-label">Last session</span>
                <span class="home-row-value" id="home-last-value">–</span>
            </span>
            <span class="home-row-stats" id="home-last-stats"></span>
            <span class="home-chevron" aria-hidden="true">&#8250;</span>
        </button>
    `;

    document.getElementById("home-settings-btn").onclick = function() { renderSettingsPage(); };
    showGreeting();
    resetWeek(opts && opts.keepDay ? rememberedDay() : null);
    wireWeek();
    wireDayCard();
    renderWeek();
    // A kept day in another week: fetch that week's days.
    if (week.start !== thisMonday()) goToWeek(week.start, selected);
    wireWeightLogging();
    loadStats();
    loadBodyWeight();
}

// "Hi, <name>" under the title once there's a profile. Exported so the
// set-up page can fill it in as it closes.
function showGreeting() {
    const greeting = document.getElementById("home-greeting");
    if (!greeting) return;
    const name = state.profile && state.profile.name;
    greeting.textContent = name ? `Hi, ${name}` : "";
}

/* --- Week strip ---
   A Monday-start week with its seven days. The selected day shows by the
   greeting (date + Today); tapping a day selects it; the arrows or a swipe
   step a week, keeping the weekday. This week's days come with the
   overview; other weeks are fetched when shown. Today: its letter in a
   dark pill. Selected: a ring round the box. Done: green, number kept, a
   tick badge. Planned (still to do): dashed rose. Home always opens on
   today. */
const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
let week = null;            // { start: Monday "YYYY-MM-DD", days: [...] | null while loading }
let selected = null;        // "YYYY-MM-DD"
let thisWeekDays = null;    // this week's days from the overview, reused by Today
let weekStreak = null;      // from the overview; null until it's in
let weekRequest = 0;        // the latest week fetch; older answers are ignored
let overview = null;        // GET /sessions/overview, for today's plan and Next up
let overviewFailed = false; // it didn't come: today's card offers Start a Workout

/* Back on screen with Home open (the app was in the background): a new
   day starts Home over on today; otherwise, after a minute away, its data
   is fetched again in place, keeping the selected day and week. Not while
   a weight is being typed: that would end the typing. */
const REFRESH_AFTER_MS = 60 * 1000;
let hiddenAt = null;
let shownOn = null;     // the day Home was last drawn for

document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
    }
    if (!document.getElementById("home-days")) return;
    const awayFor = hiddenAt === null ? 0 : Date.now() - hiddenAt;
    hiddenAt = null;
    const input = document.getElementById("home-weight-input");
    if (input && !input.hidden) return;
    if (localIso(new Date()) !== shownOn) renderHomePage();
    else if (awayFor >= REFRESH_AFTER_MS) refreshHome();
});

function refreshHome() {
    loadStats();
    loadBodyWeight();
    // Another week on screen: its days too (this week's come with the stats).
    if (week.start !== thisMonday()) {
        const start = week.start;
        const request = ++weekRequest;
        fetchWeek(start).then(function(days) {
            if (request !== weekRequest || week.start !== start || !document.getElementById("home-days")) return;
            week.days = days;
            renderWeek();
        }).catch(function() { /* keep what's shown */ });
    }
}

// Back to Home from a page opened on it: the same day selected.
export function backToHome() {
    highlightTab("home");
    document.getElementById("app-scroll").scrollTo(0, 0);
    renderHomePage({ keepDay: true });
}

const DAY_KEY = "fitness.homeDay";

function rememberDay() {
    try {
        sessionStorage.setItem(DAY_KEY, JSON.stringify({ day: selected, on: localIso(new Date()) }));
    } catch (e) { /* private mode etc.: Back just starts on today */ }
}

// The day picked earlier today in this session, or null.
function rememberedDay() {
    try {
        const kept = JSON.parse(sessionStorage.getItem(DAY_KEY));
        if (kept && kept.on === localIso(new Date()) && /^\d{4}-\d{2}-\d{2}$/.test(kept.day)) return kept.day;
    } catch (e) { /* nothing kept */ }
    return null;
}

// day: the day to select (null: today), its week shown.
function resetWeek(day) {
    shownOn = localIso(new Date());
    selected = day || localIso(new Date());
    const [y, m, d] = selected.split("-").map(Number);
    week = { start: localIso(mondayOf(new Date(y, m - 1, d))), days: null };
    thisWeekDays = null;
    weekStreak = null;
    overview = null;
    overviewFailed = false;
}

function thisMonday() {
    return localIso(mondayOf(new Date()));
}

function wireWeek() {
    document.getElementById("home-days").onclick = function(e) {
        const day = e.target.closest(".home-day");
        if (!day) return;
        selected = day.dataset.date;
        renderWeek();
    };
    document.getElementById("home-week-prev").onclick = function() { stepWeek(-1); };
    document.getElementById("home-week-next").onclick = function() { stepWeek(1); };
    document.getElementById("home-today-btn").onclick = function() {
        goToWeek(thisMonday(), localIso(new Date()));
    };
    // A sideways swipe on the strip steps a week (not a mostly-vertical one).
    const strip = document.getElementById("home-strip");
    let startX = null, startY = null;
    strip.addEventListener("touchstart", function(e) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });
    strip.addEventListener("touchend", function(e) {
        if (startX === null) return;
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        startX = null;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) stepWeek(dx < 0 ? 1 : -1);
    });
}

function stepWeek(by) {
    const weekday = daysBetween(week.start, selected);
    const start = addDays(week.start, 7 * by);
    goToWeek(start, addDays(start, weekday));
}

async function goToWeek(start, day) {
    week = { start, days: start === thisMonday() ? thisWeekDays : null };
    selected = day;
    renderWeek();
    if (week.days) return;
    const request = ++weekRequest;
    let days;
    try {
        days = await fetchWeek(start);
    } catch (e) {
        return;   // the boxes stay plain; the arrows or Today can try again
    }
    if (request !== weekRequest || week.start !== start || !document.getElementById("home-days")) return;
    if (start === thisMonday()) thisWeekDays = days;
    week.days = days;
    renderWeek();
}

function renderWeek() {
    const daysEl = document.getElementById("home-days");
    if (!daysEl) return;
    const today = localIso(new Date());
    daysEl.innerHTML = LETTERS.map(function(letter, i) {
        const date = addDays(week.start, i);
        const info = week.days ? week.days[i] : null;
        const done = !!(info && info.done);
        const planned = !done && date >= today && !!(info && info.planned);
        const skipped = !done && !planned && !!info && skippedPlans(info, date, today).length > 0;
        const classes = ["home-day"];
        if (done) classes.push("done");
        if (planned) classes.push("planned");
        if (skipped) classes.push("skipped");
        if (date === today) classes.push("today");
        if (date === selected) classes.push("selected");
        const label = longDate(date) + (date === today ? ", today" : "") + (done ? ", done" : planned ? ", planned" : skipped ? ", skipped" : "");
        return `<button type="button" class="${classes.join(" ")}" data-date="${date}" aria-label="${label}" aria-pressed="${date === selected}">
                <span class="home-day-letter">${letter}</span>
                <span class="home-day-box">${Number(date.slice(8))}${done ? `<span class="home-day-badge">${CHECK}</span>` : ""}</span>
            </button>`;
    }).join("");

    document.getElementById("home-sel-date").textContent = dayHeading(selected);
    document.getElementById("home-today-btn").classList.toggle("here", selected === today);
    rememberDay();
    renderWeekFoot();
    renderDayCard();
}

/* Under the strip: "1 / 3 sessions done this week · 4-week streak" (with
   a flame). The goal is this week's only (a past week may have had
   another), so other weeks just count: "3 sessions done that week".
   Blank while the week loads. */
function renderWeekFoot() {
    const foot = document.getElementById("home-week-foot");
    if (!week.days) { foot.innerHTML = ""; return; }
    const n = week.days.reduce(function(sum, day) { return sum + day.sessions.length; }, 0);
    const isThisWeek = week.start === thisMonday();
    const goal = isThisWeek && state.profile && state.profile.weeklyGoal;
    const count = goal ? `${n} / ${goal} ${goal === 1 ? "session" : "sessions"}` : `${n} ${n === 1 ? "session" : "sessions"}`;
    let html = `<span><b>${count}</b> done ${isThisWeek ? "this" : "that"} week</span>`;
    if (weekStreak !== null && weekStreak !== undefined) {
        html += `<span class="home-sep">·</span>${FLAME}` + (weekStreak > 0
            ? `<span><b>${weekStreak}-week</b> streak</span>`
            : "<span>no streak yet</span>");
    }
    foot.innerHTML = html;
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

/* Fills the Bodyweight tile. Badge: TODAY / 1D AGO / 2D AGO / 3D AGO (short:
   YESTERDAY or "2 DAYS AGO" would squeeze the title at 390px); from 4 days
   old it's replaced by a "Last logged 24th Oct" note. Leaves the
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
    } else if (days <= 3) {
        badge.textContent = `${days}d ago`;
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
    let data;
    try {
        data = await fetchOverview(localIso(mondayOf(new Date())), today);
    } catch (e) {
        // Offline or the server's down: keep what's shown (a refresh keeps
        // its data); on a first load, let today's card start something.
        if (!overview && document.getElementById("home-days")) {
            overviewFailed = true;
            renderDayCard();
        }
        return;
    }
    if (!document.getElementById("home-days")) return;
    overviewFailed = false;

    overview = data;
    weekStreak = overview.weekStreak;
    thisWeekDays = overview.weekDays || null;
    // This week on screen takes the fresh days (a refresh may bring new ones).
    if (week.start === thisMonday()) week.days = thisWeekDays;
    renderWeek();

    showLatestPr(overview.latestPr || null);
    showLastSession(overview.lastSession, overview.lastSessionSets || 0);
}

/* --- Latest PR and Last session rows ---
   Latest PR: the newest ★ on any exercise's History tab, its date by the
   label so the value gets the whole line: "Bench Press · 85 kg × 5", or
   for a one-sided exercise each side that set it, "L 20 kg × 8 · R 18 kg
   × 8". Only the name gives way (…); the numbers always show. */
function showLatestPr(pr) {
    const row = document.getElementById("home-pr-row");
    if (!row) return;
    if (!pr) {
        setRow(row, false);
        document.getElementById("home-pr-label").textContent = "Latest PR";
        document.getElementById("home-pr-value").textContent = "None yet: log a workout to set one";
        return;
    }
    const sides = pr.sides.map(function(side) {
        const one = prText(side, pr.logType);
        return pr.sides.length > 1 || side.side ? `${side.side === "LEFT" ? "L" : "R"} ${one}` : one;
    }).join(" · ");
    document.getElementById("home-pr-label").textContent = `Latest PR · ${dayHeading(pr.date)}`;
    document.getElementById("home-pr-value").innerHTML =
        `<span class="home-row-name">${esc(pr.exerciseName)}</span><span class="home-row-nums"> · ${sides}</span>`;
    row.setAttribute("aria-label", `Latest PR, ${dayHeading(pr.date)}: ${pr.exerciseName}, ${sides}. Open its history`);
    setRow(row, true, function() { openPrHistory(pr.exerciseId); });
}

// The best set, as the History tab shows it: "85 kg × 5" (0 kg: "12
// reps"), "15 reps", "1:30", "5.2 km" (no distance: the time).
function prText(set, logType) {
    switch (logType) {
        case "REPS": return `${set.reps} reps`;
        case "TIME": return formatDuration(set.durationSeconds);
        case "DISTANCE_TIME": return set.distanceKm != null ? `${decimal(set.distanceKm)} km` : formatDuration(set.durationSeconds);
        default: return set.weight > 0 ? `${decimal(set.weight)} kg × ${set.reps}` : `${set.reps} reps`;
    }
}

function decimal(n) {
    return String(Math.round(n * 100) / 100);
}

async function openPrHistory(exerciseId) {
    let exercise;
    try {
        exercise = await fetchExercise(exerciseId);
    } catch (e) {
        return;   // offline or gone: stay on Home
    }
    highlightTab("exercises");
    renderExercisePage(exercise, {
        routeFor: id => `#/exercises/${id}`,
        tab: "history",
        onBack: backToHome
    });
}

/* Last session: "Pull Day · Sat 15 Nov", then "14 sets · 52 min" (no
   length without a stopwatch time) → its summary, Back to Home. */
function showLastSession(last, sets) {
    const row = document.getElementById("home-last-row");
    if (!row) return;
    const value = document.getElementById("home-last-value");
    const stats = document.getElementById("home-last-stats");
    if (!last) {
        setRow(row, false);
        value.textContent = "No workouts yet";
        stats.textContent = "";
        return;
    }
    const name = workoutName(last.workoutId);
    value.innerHTML = `<span class="home-row-name">${esc(name)}</span><span class="home-row-nums"> · ${dayHeading(last.date)}</span>`;
    stats.textContent = setCount(sets) + (last.durationSeconds ? ` · ${duration(last.durationSeconds)}` : "");
    row.setAttribute("aria-label", `Last session: ${name}, ${dayHeading(last.date)}, ${stats.textContent}. Open its summary`);
    setRow(row, true, function() {
        viewSessionSummary(last.workoutId, last.id, last.date, backToHome,
            `${sessionSummaryRoute(last.workoutId, last.id, last.date)}&back=home`);
    });
}

// A row with something to open is a live button with a ›; without, muted.
function setRow(row, opens, onOpen) {
    row.classList.toggle("none", !opens);
    row.disabled = !opens;
    row.onclick = opens ? onOpen : null;
    if (!opens) row.removeAttribute("aria-label");
}

/* --- The selected day's card ---
   One card, the same height whatever it shows, for the day picked in the
   strip. Today: Resume a workout that's open (its details: sets logged,
   when it started); else Start today's plan (the earliest added, linked so
   finishing marks it done; "+N more" opens the day in the calendar; once
   something's finished today its line becomes "✓ Pull Day done earlier"),
   no Start when the workout has no exercises; else what's done today; else
   "Nothing planned today" with Next up and Start a Workout. Another day:
   what was done (one: View Summary; more: a line each), or what's planned
   (View in Calendar), or skipped, or nothing. Skipped follows the
   calendar: a plan marked skipped, or a past day's plan never done. */
function renderDayCard() {
    const el = document.getElementById("home-day-card");
    if (!el) return;
    const today = localIso(new Date());
    const isToday = selected === today;
    const info = week.days ? week.days[daysBetween(week.start, selected)] : null;
    const sessions = info ? info.sessions : [];
    // A past day's plans still to do count as skipped (calendar.js effectiveStatus).
    const plans = info && selected >= today ? info.plans : [];
    const skipped = info ? skippedPlans(info, selected, today) : [];
    const live = isToday ? liveWorkout() : null;
    let c;

    if (live) {
        c = { badge: "In progress", badgeClass: "logged", name: live.name, sub: "In progress",
            foot: `<button type="button" class="home-card-btn live" data-action="resume">Resume ${esc(live.name)}</button>` };
    } else if (!info) {
        // Still loading: nothing to say yet, and Start waits (today may have
        // a plan to link it to). Failed: today can still start something.
        c = { name: "–", sub: "", foot: isToday ? startAnyButton(!overviewFailed && week.start === thisMonday()) : "" };
    } else if (isToday && plans.length) {
        c = todayPlanCard(plans, sessions, today);
    } else if (sessions.length === 1) {
        const one = sessions[0];
        c = { badge: "Done", badgeClass: "logged", name: one.workoutName, sub: sessionStats(one),
            foot: `<button type="button" class="home-card-btn secondary" data-action="summary" ${sessionData(one)}>View Summary</button>` };
    } else if (sessions.length > 1) {
        c = { badge: "Done", badgeClass: "logged", lines: sessions.map(function(one) {
            return `<button type="button" class="home-card-line" data-action="summary" ${sessionData(one)}>
                    <span class="home-card-line-name">${esc(one.workoutName)}</span>
                    <span class="home-card-stats">${sessionStats(one)}</span><span class="home-chevron">&#8250;</span>
                </button>`;
        }).join("") };
    } else if (skipped.length) {
        // Today can still train: Start a Workout rather than the calendar.
        c = { badge: "Skipped", badgeClass: "skipped", name: skipped[0].workoutName,
            sub: (isToday ? "Skipped for today" : "Not done") + moreLink(skipped.length - 1),
            foot: isToday ? startAnyButton()
                : `<button type="button" class="home-card-btn secondary" data-action="calendar">View in Calendar</button>` };
    } else if (isToday) {
        const next = overview && overview.nextPlanned;
        const upcoming = next && next.date > today;
        c = { name: "Nothing planned today",
            sub: upcoming ? `Next up: <b>${esc(workoutName(next.workoutId))}</b> · ${dayHeading(next.date)}`
                : "Pick a workout, or plan one in the calendar",
            foot: startAnyButton() };
    } else if (plans.length) {
        const plan = plans[0];
        c = { badge: "Planned", badgeClass: "planned", name: plan.workoutName,
            sub: exerciseCount(plan.workoutId) + moreLink(plans.length - 1),
            foot: `<button type="button" class="home-card-btn secondary" data-action="calendar">View in Calendar</button>` };
    } else {
        c = { muted: true, name: selected < today ? "Nothing logged" : "Nothing planned",
            sub: selected < today ? "No workout done this day" : "No workout planned this day" };
    }

    el.className = "home-card" + (c.muted ? " muted" : "");
    el.innerHTML = `
        <div class="home-tile-head">
            <span class="home-card-head">${DUMBBELL}<span class="home-tile-title">${cardTitle(selected, today)}</span></span>
            ${c.badge ? `<span class="home-tile-badge ${c.badgeClass}">${c.badge}</span>` : ""}
        </div>
        ${c.lines ? `<div class="home-card-lines">${c.lines}</div>` : `
            <div class="home-card-name">${esc(c.name)}</div>
            <div class="home-card-sub" id="home-card-sub">${c.sub}</div>`}
        ${c.foot || ""}`;
    if (live) showLiveDetails(live);
}

// A day's skipped plans: marked skipped, plus, on a past day, the ones
// never done.
function skippedPlans(info, date, today) {
    return (date < today ? info.plans : []).concat(info.skipped || []);
}

// Today's plan: Start it, unless the workout has no exercises yet.
function todayPlanCard(plans, sessions, today) {
    // The overview's next plan is today's earliest added, with what Start
    // needs to link to it (a repeat rule's day has no id yet).
    const next = overview && overview.nextPlanned && overview.nextPlanned.date === today ? overview.nextPlanned : null;
    const workoutId = next ? next.workoutId : plans[0].workoutId;
    const name = next ? workoutName(workoutId) : plans[0].workoutName;
    const workout = findWorkout(workoutId);
    const more = moreLink(plans.length - 1);
    let sub;
    if (sessions.length) {
        const last = sessions[sessions.length - 1];
        sub = `<button type="button" class="home-card-done" data-action="summary" ${sessionData(last)}>${CHECK}<span>${esc(last.workoutName)} done earlier · ${setCount(last.sets)}</span> <span class="home-chevron">&#8250;</span></button>` + more;
    } else {
        const lastDone = next && overview.nextLastDone;
        sub = exerciseCount(workoutId) + (lastDone ? ` · last done ${dayHeading(lastDone)}` : "") + more;
    }
    const canStart = workout && workout.exerciseCount > 0;
    return { badge: "Planned", badgeClass: "planned", name, sub,
        foot: canStart
            ? `<button type="button" class="home-card-btn" data-action="start" data-workout="${workoutId}">Start ${esc(name)}</button>`
            : `<button type="button" class="home-card-btn secondary" data-action="calendar">View in Calendar</button>` };
}

// waiting: shown but not pressable yet (the card keeps its height).
function startAnyButton(waiting) {
    return `<button type="button" class="home-card-btn" data-action="workouts"${waiting ? " disabled" : ""}>Start a Workout</button>`;
}

// The card's buttons, wired once: the card is redrawn on every change.
function wireDayCard() {
    const el = document.getElementById("home-day-card");
    el.onclick = function(e) {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === "workouts") setActiveTab("workouts");
        if (action === "calendar") navigateToCalendarDay(selected);
        if (action === "resume") {
            const live = liveWorkout();
            if (live) startWorkout(live.id, { button: btn, onComplete: function() { setActiveTab("home"); } });
        }
        if (action === "start") {
            const today = localIso(new Date());
            const next = overview && overview.nextPlanned;
            const schedule = next && next.date === today && String(next.workoutId) === btn.dataset.workout ? next : null;
            startWorkout(Number(btn.dataset.workout), {
                button: btn,
                schedule,
                onComplete: function() { setActiveTab("home"); }
            });
        }
        if (action === "summary") {
            const workoutId = Number(btn.dataset.workout);
            const sessionId = Number(btn.dataset.session);
            const date = btn.dataset.date;
            viewSessionSummary(workoutId, sessionId, date, backToHome,
                `${sessionSummaryRoute(workoutId, sessionId, date)}&back=home`);
        }
    };
}

/* An open workout's line: "6 sets logged · started 18 min ago" ("Nothing
   logged yet" before the first set). The sets come from the server, so
   the line fills in a moment after the card. */
async function showLiveDetails(live) {
    const startedAt = getWorkoutStartedAt(live.id);
    const started = startedAt ? ` · started ${agoText(startedAt)}` : "";
    const sub = document.getElementById("home-card-sub");
    if (sub) sub.textContent = "Nothing logged yet" + started;
    if (state.currentSessionId === null) return;
    const sessionId = state.currentSessionId;
    let sets;
    try {
        sets = await fetchSessionSets(sessionId);
    } catch (e) {
        return;
    }
    const now = document.getElementById("home-card-sub");
    if (!now || state.currentSessionId !== sessionId || selected !== localIso(new Date())) return;
    now.textContent = (sets.length ? `${setCount(sets.length)} logged` : "Nothing logged yet") + started;
}

// "just now", "18 min ago", "1 h 5 min ago".
function agoText(ms) {
    const min = Math.max(0, Math.floor((Date.now() - ms) / 60000));
    if (min < 1) return "just now";
    return `${duration(min * 60)} ago`;
}

// "Today" / "Yesterday" / "Tomorrow", else the weekday ("Thursday"); the
// full date is by the greeting.
function cardTitle(yyyyMmDd, todayIso) {
    const days = daysBetween(todayIso, yyyyMmDd);
    if (days === 0) return "Today";
    if (days === -1) return "Yesterday";
    if (days === 1) return "Tomorrow";
    const [y, m, d] = yyyyMmDd.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long" });
}

// "14 sets · 52 min"; the length only when the session has one.
function sessionStats(one) {
    return setCount(one.sets) + (one.durationSeconds ? ` · ${duration(one.durationSeconds)}` : "");
}

function setCount(n) {
    return `${n} ${n === 1 ? "set" : "sets"}`;
}

// "52 min", "1 h 12 min", "2 h".
function duration(seconds) {
    const min = Math.max(1, Math.round(seconds / 60));
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
}

// "5 exercises"; "No exercises yet" for an empty workout.
function exerciseCount(workoutId) {
    const workout = findWorkout(workoutId);
    const n = workout ? workout.exerciseCount : null;
    if (n === null || n === undefined) return "";
    return n === 0 ? "No exercises yet" : `${n} ${n === 1 ? "exercise" : "exercises"}`;
}

// " · +1 more ›", opening the day in the calendar to pick another.
function moreLink(more) {
    return more > 0 ? ` · <button type="button" class="home-card-more" data-action="calendar">+${more} more &#8250;</button>` : "";
}

function sessionData(one) {
    return `data-workout="${one.workoutId}" data-session="${one.sessionId}" data-date="${selected}"`;
}

// Names are the user's own text.
function esc(text) {
    return String(text).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

function workoutName(workoutId) {
    const workout = findWorkout(workoutId);
    return workout ? workout.name : "Workout";
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
            <div class="home-tile-value">${today.toLocaleString("en-NZ")}<span class="home-tile-unit"> / ${shortCount(STEP_GOAL)}</span></div>
        </div>
        <div class="home-meter"><div class="home-meter-fill" style="width: ${pct}%"></div></div>
        <div class="home-steps-chart">
            <div class="home-steps-goal" style="bottom: ${Math.round((STEP_GOAL / top) * 100)}%"></div>
            ${bars}
        </div>
    `;
}

// "10k" for a round thousand, else "8,500": keeps the goal short beside
// today's count.
function shortCount(n) {
    return n >= 1000 && n % 1000 === 0 ? `${n / 1000}k` : n.toLocaleString("en-NZ");
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

// "Tue 17 Nov", with the year added when it isn't this year.
function dayHeading(yyyyMmDd) {
    const [y, m, d] = yyyyMmDd.split("-").map(Number);
    const opts = { weekday: "short", day: "numeric", month: "short" };
    if (y !== new Date().getFullYear()) opts.year = "numeric";
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", opts).replace(",", "");
}

// "Tuesday 17 November", for screen readers.
function longDate(yyyyMmDd) {
    const [y, m, d] = yyyyMmDd.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

// The YYYY-MM-DD n days after (before, if negative) another.
function addDays(yyyyMmDd, n) {
    const [y, m, d] = yyyyMmDd.split("-").map(Number);
    return localIso(new Date(y, m - 1, d + n));
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
