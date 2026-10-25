import { setActiveTab, clearNavGuard } from "../components/bottomNav.js";
import { setRoute } from "../router.js";
import { fetchBodyWeightHistory, logBodyWeight, deleteBodyWeight } from "../api.js";
import { showWeighInModal } from "../components/modals.js";

/* Bodyweight history — opened by tapping the Bodyweight tile on Home.
   A chart over the chosen range (1M / 3M / All), then every weigh-in by
   month, newest first, with the change since the one before. Tap a row to
   fix or delete it; "Add Weigh-in" fills in a missed day. */

const RANGES = [
    { key: "1M", days: 30 },
    { key: "3M", days: 90 },
    { key: "All", days: null },
];

let range = "1M";   // kept while the app is open

export async function renderBodyWeightPage() {
    clearNavGuard();
    setRoute("#/bodyweight");
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <h2>Bodyweight</h2>
        <div class="page-actions">
            <button id="bw-add-btn">Add Weigh-in</button>
            <button class="btn-secondary" id="bw-back-btn">Back</button>
        </div>
        <div class="bw-chart-panel">
            <div class="bw-range-row" role="group" aria-label="Chart range">
                ${RANGES.map(r => `<button type="button" class="filter-pill bw-range" data-range="${r.key}">${r.key}</button>`).join("")}
            </div>
            <div id="bw-chart"></div>
        </div>
        <div id="bw-list"><p class="bw-empty">Loading…</p></div>
    `;
    document.getElementById("bw-back-btn").onclick = function() { setActiveTab("home"); };

    let entries;
    try {
        entries = await fetchBodyWeightHistory();
    } catch (e) {
        if (!document.getElementById("bw-list")) return;
        document.getElementById("bw-list").innerHTML =
            `<p class="bw-empty">Couldn't load your weigh-ins. Check your connection and try again.</p>`;
        return;
    }
    if (!document.getElementById("bw-list")) return;   // navigated away meanwhile

    const today = localIso(new Date());
    const byDate = new Map(entries.map(e => [e.date, e.weightKg]));

    function openModal(entry) {
        showWeighInModal({
            entry,
            byDate,
            todayIso: today,
            onSave: (date, kg) => logBodyWeight(date, kg),
            onDelete: date => deleteBodyWeight(date),
        }).then(function(changed) {
            if (changed) renderBodyWeightPage();
        });
    }

    document.getElementById("bw-add-btn").onclick = function() { openModal(null); };

    for (const btn of document.querySelectorAll(".bw-range")) {
        btn.onclick = function() {
            range = btn.dataset.range;
            showChart(entries, today);
        };
    }
    showChart(entries, today);
    showList(entries, openModal);
}

function showChart(entries, today) {
    for (const btn of document.querySelectorAll(".bw-range")) {
        btn.classList.toggle("selected", btn.dataset.range === range);
    }
    const days = RANGES.find(r => r.key === range).days;
    const from = days === null ? null : addDays(today, -(days - 1));
    const shown = from === null ? entries : entries.filter(e => e.date >= from);
    document.getElementById("bw-chart").innerHTML = shown.length < 2
        ? `<p class="bw-chart-empty">${entries.length < 2 ? "Log a couple of days to see a chart." : "Not enough weigh-ins in this range."}</p>`
        : chartSvg(shown, from || shown[0].date, today);
}

/* Line chart in viewBox units: square markers on each weigh-in, a dashed
   line at the range's highest and lowest weight, labels in HTML below so
   the pixel font isn't scaled with the SVG. */
function chartSvg(points, fromIso, toIso) {
    const W = 300, H = 120, PAD = 8;
    const kgs = points.map(p => p.weightKg);
    let lo = Math.min(...kgs), hi = Math.max(...kgs);
    if (hi - lo < 1) { const mid = (hi + lo) / 2; lo = mid - 0.5; hi = mid + 0.5; }
    const span = Math.max(1, daysBetween(fromIso, toIso));
    const x = iso => PAD + (daysBetween(fromIso, iso) / span) * (W - 2 * PAD);
    const y = kg => PAD + ((hi - kg) / (hi - lo)) * (H - 2 * PAD);
    const coords = points.map(p => [x(p.date), y(p.weightKg)]);
    const line = coords.map(([cx, cy]) => `${cx.toFixed(1)},${cy.toFixed(1)}`).join(" ");
    const marks = coords.map(([cx, cy]) =>
        `<rect x="${(cx - 2.5).toFixed(1)}" y="${(cy - 2.5).toFixed(1)}" width="5" height="5"/>`).join("");
    const first = points[0], last = points[points.length - 1];
    const change = Math.round((last.weightKg - first.weightKg) * 10) / 10;
    return `
        <div class="bw-chart-head">
            <span class="bw-chart-range">${Math.max(...kgs).toFixed(1)} high · ${Math.min(...kgs).toFixed(1)} low</span>
            <span class="bw-chart-change${change < 0 ? " down" : ""}">${change === 0 ? "No change" : `${change < 0 ? "▼" : "▲"} ${Math.abs(change).toFixed(1)} kg`}</span>
        </div>
        <svg class="bw-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
             aria-label="Weight from ${first.weightKg.toFixed(1)} to ${last.weightKg.toFixed(1)} kg">
            <line class="bw-chart-guide" x1="0" x2="${W}" y1="${y(Math.max(...kgs)).toFixed(1)}" y2="${y(Math.max(...kgs)).toFixed(1)}"/>
            <line class="bw-chart-guide" x1="0" x2="${W}" y1="${y(Math.min(...kgs)).toFixed(1)}" y2="${y(Math.min(...kgs)).toFixed(1)}"/>
            <polyline class="bw-chart-line" points="${line}"/>
            <g class="bw-chart-marks">${marks}</g>
        </svg>
        <div class="bw-chart-axis"><span>${shortDate(fromIso)}</span><span>${shortDate(toIso)}</span></div>
    `;
}

function showList(entries, openModal) {
    const list = document.getElementById("bw-list");
    if (entries.length === 0) {
        list.innerHTML = `<p class="bw-empty">No weigh-ins yet. Log today's from the Home page, or add a past day.</p>`;
        return;
    }
    // Newest first; each change is against the weigh-in before it.
    const rows = entries.map((e, i) => ({
        ...e,
        change: i > 0 ? Math.round((e.weightKg - entries[i - 1].weightKg) * 10) / 10 : null,
    })).reverse();

    let html = "";
    let month = null;
    for (const r of rows) {
        const m = monthLabel(r.date);
        if (m !== month) {
            if (month !== null) html += "</ul>";
            html += `<h3 class="bw-month">${m}</h3><ul class="bw-rows">`;
            month = m;
        }
        const change = r.change === null ? ""
            : r.change === 0 ? "–"
            : `${r.change < 0 ? "▼" : "▲"} ${Math.abs(r.change).toFixed(1)}`;
        html += `
            <li class="bw-row" data-date="${r.date}" role="button" tabindex="0">
                <span class="bw-row-date">${rowDate(r.date)}</span>
                <span class="bw-row-kg">${r.weightKg.toFixed(1)}<span class="bw-row-unit"> kg</span></span>
                <span class="bw-row-change${r.change < 0 ? " down" : ""}">${change}</span>
            </li>`;
    }
    list.innerHTML = html + "</ul>";

    for (const li of list.querySelectorAll(".bw-row")) {
        const entry = entries.find(e => e.date === li.dataset.date);
        li.onclick = function() { openModal(entry); };
        li.onkeydown = function(e) { if (e.key === "Enter") openModal(entry); };
    }
}

function localIso(d) {
    return d.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
}

function parse(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function addDays(iso, n) {
    const d = parse(iso);
    d.setDate(d.getDate() + n);
    return localIso(d);
}

function daysBetween(fromIso, toIso) {
    const [fy, fm, fd] = fromIso.split("-").map(Number);
    const [ty, tm, td] = toIso.split("-").map(Number);
    return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

// "Sat 25"
function rowDate(iso) {
    const d = parse(iso);
    return `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${d.getDate()}`;
}

// "October 2026"
function monthLabel(iso) {
    return parse(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

// "25 Oct", with the year added when it isn't this year.
function shortDate(iso) {
    const d = parse(iso);
    const opts = { day: "numeric", month: "short" };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
    return d.toLocaleDateString("en-GB", opts);
}
