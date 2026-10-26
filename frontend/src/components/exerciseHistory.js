import { fetchExerciseHistory } from "../api.js";
import { findWorkout } from "../state.js";
import { logTypeLabel } from "../config.js";
import { escapeHtml, formatDuration } from "../utils/format.js";
import { lineChartHtml } from "./lineChart.js";

/* An exercise's trend chart, PRs and past sessions, rendered into `container`. Used by
   the History tab of the exercise popup in a live workout (and the
   exercise page's History tab). Sessions come 10 at a time with "Load more".
   ★ marks the set shown in the Best set card, one per side for a
   unilateral exercise (the backend decides; see ExerciseHistoryService).
   Every session shows its sets as they were logged; where the exercise's
   type changed, a divider says how the older sessions were logged. */

const PAGE_SIZE = 10;

const RANGES = [
    { key: "1M", days: 30 },
    { key: "3M", days: 90 },
    { key: "1Y", days: 365 },
    { key: "All", days: null },
];

let trendRange = "3M";   // kept while the app is open

export async function renderExerciseHistory(container, exerciseId) {
    container.innerHTML = `<p class="exh-empty">Loading…</p>`;
    let first;
    try {
        first = await fetchExerciseHistory(exerciseId, 0, PAGE_SIZE);
    } catch (e) {
        container.innerHTML = `<p class="exh-empty">Couldn't load the history. Check your connection and try again.</p>`;
        return;
    }
    if (first.sessions.length === 0) {
        container.innerHTML = `<p class="exh-empty">No finished sessions yet. Your history and PRs show up here after the first one.</p>`;
        return;
    }

    container.innerHTML = `
        <div class="exh-trend">
            <div class="chart-range-row" role="group" aria-label="Chart range">
                ${RANGES.map(r => `<button type="button" class="filter-pill exh-range" data-range="${r.key}">${r.key}</button>`).join("")}
            </div>
            <div class="exh-trend-chart"></div>
        </div>
        ${recordsHtml(first.records)}
        <div class="exh-sessions"></div>
        <button type="button" class="btn-secondary exh-more" hidden>Load more</button>
    `;
    const trend = first.trend || { metric: "MAX_KG", points: [] };
    for (const btn of container.querySelectorAll(".exh-range")) {
        btn.onclick = function() {
            trendRange = btn.dataset.range;
            showTrend(container, trend);
        };
    }
    showTrend(container, trend);

    const list = container.querySelector(".exh-sessions");
    const more = container.querySelector(".exh-more");
    let page = 0;
    // The session above the next one appended (none yet: the type is the
    // exercise's own), for the dividers.
    let above = { logType: first.records.logType, date: null };

    function append(history) {
        const html = history.sessions.map(function(session) {
            const divider = session.logType !== above.logType ? dividerHtml(session.logType, above) : "";
            above = session;
            return divider + sessionHtml(session);
        });
        list.insertAdjacentHTML("beforeend", html.join(""));
        more.hidden = !history.hasMore;
    }
    append(first);

    more.onclick = async function() {
        more.disabled = true;
        more.textContent = "Loading…";
        try {
            const next = await fetchExerciseHistory(exerciseId, page + 1, PAGE_SIZE);
            page++;
            append(next);
            more.textContent = "Load more";
        } catch (e) {
            more.textContent = "Couldn't load — tap to retry";
        }
        more.disabled = false;
    };
}

/* Each session's best over the chosen range, the same best as the PR
   cards: Weight & reps the estimated max, Reps the most, Time the longest,
   Distance & time the longest distance (or time, with no distances). A
   unilateral exercise gets a line per side. The range starts at the first
   session if that's later, so a short history fills the width. */
function showTrend(container, trend) {
    for (const btn of container.querySelectorAll(".exh-range")) {
        btn.classList.toggle("selected", btn.dataset.range === trendRange);
    }
    const today = new Date().toLocaleDateString("en-CA");
    const days = RANGES.find(r => r.key === trendRange).days;
    const points = trend.points;   // oldest first
    const dates = ps => new Set(ps.map(p => p.date)).size;
    const rangeStart = days === null ? "" : addDays(today, -(days - 1));
    const first = points.length > 0 ? points[0].date : "";
    const from = first > rangeStart ? first : rangeStart;
    const shown = points.filter(p => p.date >= from);
    const chart = container.querySelector(".exh-trend-chart");
    if (dates(shown) < 2) {
        const n = dates(shown);
        chart.innerHTML = `<p class="chart-empty">${dates(points) < 2 ? "Log sessions on a couple of days to see a chart."
            : `${n === 0 ? "No sessions" : "Only 1 session"} in the last ${days} days.`}</p>`;
        return;
    }

    const m = METRICS[trend.metric] || METRICS.MAX_KG;
    // Both sides (a two-sided past, before it became unilateral), L, R.
    const lines = [[null, "Both", "chart-line-both"], ["LEFT", "L", ""], ["RIGHT", "R", "chart-line-r"]]
        .map(([side, label, cls]) => ({ label, cls, points: shown.filter(p => (p.side || null) === side) }))
        .filter(l => l.points.length > 0);
    if (lines.length === 1) lines[0].cls = "";   // a line on its own is the chart's colour
    const change = function(l) {
        const d = Math.round((l.points[l.points.length - 1].value - l.points[0].value) * 10) / 10;
        if (l.points.length < 2 || d === 0) return `<span class="exh-trend-change">–</span>`;
        return `<span class="exh-trend-change${d > 0 ? " up" : ""}">${d > 0 ? "▲" : "▼"} ${m.format(Math.abs(d))}</span>`;
    };
    // One line: its change. More: a key, each side with its change.
    const right = lines.length === 1 ? change(lines[0]) : `<span class="exh-trend-key">${lines.map(l => `
        <span class="exh-trend-side"><i class="exh-trend-swatch ${l.cls}"></i>${l.label} ${change(l)}</span>`).join("")}</span>`;
    const best = Math.max(...shown.map(p => p.value));
    chart.innerHTML = lineChartHtml({
        head: { left: `${m.label} ${m.format(best)}`, right },
        lines: lines.map(l => ({ cls: l.cls, points: l.points })),
        fromIso: from, toIso: today,
        minSpan: m.minSpan,
        label: `${m.label} per session, best ${m.format(best)}`,
    });
}

// The trend's metric (ExerciseHistoryService.trend): its head label, how a
// value reads, and the smallest value range drawn.
const METRICS = {
    MAX_KG: { label: "Best est. max", format: v => `${kg(v)} kg`, minSpan: 5 },
    REPS: { label: "Most reps", format: v => `${kg(v)} reps`, minSpan: 2 },
    SECONDS: { label: "Longest", format: v => formatDuration(Math.round(v)), minSpan: 10 },
    KM: { label: "Longest", format: v => `${kg(v)} km`, minSpan: 0.5 },
};

function addDays(iso, n) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d + n).toLocaleDateString("en-CA");
}

/* The PR cards, for the exercise's type now (records.logType; older
   sessions logged another way don't count). Weight & reps: Heaviest weight
   and Best set. Reps: Most reps. Time: Longest time. Distance & time:
   Longest distance (Longest time if no set has a distance) and Fastest
   pace. A unilateral exercise's best gets a line per side in a wide card. */
function recordsHtml(records) {
    const type = records.logType || "WEIGHT_REPS";
    const card = (label, value, sub) => `
        <div class="exh-record">
            <div class="exh-record-label">${label}</div>
            <div class="exh-record-value">${value}</div>
            <div class="exh-record-sub">${sub}</div>
        </div>`;
    const unit = u => `<span class="exh-unit"> ${u}</span>`;

    // The type's best: its card label, and a record's value and small print.
    let best;
    if (type === "WEIGHT_REPS") {
        best = { label: "Best set", value: r => `${kg(r.weight)}${unit("kg")} × ${r.reps}`,
                 sub: r => `≈ ${Math.round(r.weight * (1 + r.reps / 30))} kg max · ${shortDate(r.date)}` };
    } else if (type === "REPS") {
        best = { label: "Most reps", value: r => `${r.reps}${unit("reps")}`, sub: r => shortDate(r.date) };
    } else if (type === "DISTANCE_TIME" && [records.bestSet, records.bestLeft, records.bestRight].some(r => r && r.distanceKm != null)) {
        best = { label: "Longest distance", value: r => r.distanceKm != null ? `${kg(r.distanceKm)}${unit("km")}` : formatDuration(r.durationSeconds),
                 sub: r => `${r.distanceKm != null ? formatDuration(r.durationSeconds) + " · " : ""}${shortDate(r.date)}` };
    } else {
        best = { label: "Longest time", value: r => formatDuration(r.durationSeconds), sub: r => shortDate(r.date) };
    }

    const cards = [];
    // Heaviest weight leads with the weight alone; its reps stay as small
    // print so 87.5 × 1 and 87.5 × 9 can still be told apart.
    const h = records.heaviest;
    if (h) cards.push(card("Heaviest weight", `${kg(h.weight)}${unit("kg")}`, `× ${h.reps} · ${shortDate(h.date)}`));

    const sides = [["L", records.bestLeft], ["R", records.bestRight]].filter(([, r]) => r);
    let wide = "";
    if (sides.length === 0) {
        if (records.bestSet) cards.push(card(best.label, best.value(records.bestSet), best.sub(records.bestSet)));
    } else {
        // Unilateral: a best set (and ★) per side, too much for a half-width
        // card, so it gets its own full-width card with a line per side.
        // "Both" only appears if the exercise also has two-sided sets (it was
        // switched to unilateral later).
        if (records.bestSet) sides.unshift(["Both", records.bestSet]);
        const lines = sides.map(([label, r]) => `
            <div class="exh-side-best">
                <span class="exh-side">${label}</span>
                <span class="exh-side-best-set">${best.value(r)}</span>
                <span class="exh-record-sub">${best.sub(r)}</span>
            </div>`).join("");
        wide = `
        <div class="exh-record exh-record-wide">
            <div class="exh-record-label">${best.label}</div>
            ${lines}
        </div>`;
    }

    // Least time per km, e.g. "5:13 /km".
    const p = records.fastestPace;
    if (p) cards.push(card("Fastest pace", `${formatDuration(Math.round(p.durationSeconds / p.distanceKm))}${unit("/km")}`,
        `${kg(p.distanceKm)} km · ${shortDate(p.date)}`));

    if (cards.length === 0 && !wide) return "";
    // A lone card takes the full width, unless a wide card follows (then it
    // keeps the half width it has beside nothing, as Heaviest weight does).
    const grid = cards.length === 1 && !wide ? "exh-records exh-records-one" : "exh-records";
    return `${cards.length ? `<div class="${grid}">${cards.join("")}</div>` : ""}${wide}`;
}

/* "Logged as Weight & reps before Tue 27 Oct": the older sessions below
   were logged another way than the newer one above (or, with none above
   yet, than the exercise is now). */
function dividerHtml(logType, above) {
    const when = above.date ? shortDate(above.date) : `the switch to ${logTypeLabel(above.logType)}`;
    return `<div class="exh-divider"><span>Logged as ${logTypeLabel(logType)} before ${when}</span></div>`;
}

// A set as its session logged it: "80 kg × 4" (0 kg: "10 reps"), "15 reps",
// "1:30", or "5.2 km · 28:45" (no distance: just the time).
function setText(set, logType) {
    const unit = u => `<span class="exh-unit"> ${u}</span>`;
    switch (logType) {
        case "REPS": return `${set.reps} reps`;
        case "TIME": return formatDuration(set.durationSeconds);
        case "DISTANCE_TIME": return set.distanceKm != null
            ? `${kg(set.distanceKm)}${unit("km")} · ${formatDuration(set.durationSeconds)}`
            : formatDuration(set.durationSeconds);
        default: return set.weight > 0 ? `${kg(set.weight)}${unit("kg")} × ${set.reps}` : `${set.reps} reps`;
    }
}

function sessionHtml(s) {
    const workout = findWorkout(s.workoutId);
    const chip = set => `
        <span class="exh-set${set.pr ? " pr" : ""}">${set.pr ? `<span class="exh-star" aria-label="PR">★</span>` : ""}${setText(set, s.logType)}</span>`;
    // Unilateral: one row per side, labelled once (L, then R).
    const rows = [[null, "", s.sets.filter(x => !x.side)],
                  ["LEFT", "L", s.sets.filter(x => x.side === "LEFT")],
                  ["RIGHT", "R", s.sets.filter(x => x.side === "RIGHT")]]
        .filter(([, , sets]) => sets.length > 0)
        .map(([side, label, sets]) => `
            <div class="exh-set-row">${side ? `<span class="exh-side exh-row-side">${label}</span>` : ""}${sets.map(chip).join("")}</div>`)
        .join("");
    return `
        <div class="exh-session">
            <div class="exh-session-head">
                <span class="exh-session-date">${shortDate(s.date)}</span>
                <span class="exh-session-workout">${escapeHtml(workout ? workout.name : "Workout")}</span>
            </div>
            ${rows}
        </div>`;
}

// 60 → "60", 62.5 → "62.5" (kg or km)
function kg(n) {
    return String(Math.round(n * 100) / 100);
}

// "Tue 20 Oct", with the year added when it isn't this year.
function shortDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const opts = { weekday: "short", day: "numeric", month: "short" };
    if (y !== new Date().getFullYear()) opts.year = "numeric";
    return date.toLocaleDateString("en-GB", opts).replace(",", "");
}
