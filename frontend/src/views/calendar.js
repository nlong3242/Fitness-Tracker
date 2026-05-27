import { clearNavGuard, setActiveTab } from "../components/bottomNav.js";
import { showScheduleModal } from "../components/modals.js";
import { renderCreateWorkoutPage } from "./workouts.js";
import { escapeHtml, formatSessionDate } from "../utils/format.js";
import {
    fetchSchedulesInRange,
    fetchSchedulesByDate,
    createSchedule
} from "../api.js";
import { state } from "../state.js";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

let viewYear;
let viewMonth;

/* renderToken invalidates in-flight fetches whose paint would land on a
   view the user has already navigated away from. Every render bumps it;
   each fetch captures the value at call time and bails on mismatch. */
let renderToken = 0;

export function renderCalendarPage() {
    clearNavGuard();
    if (viewYear === undefined) {
        const today = new Date();
        viewYear = today.getFullYear();
        viewMonth = today.getMonth();
    }
    renderMonth();
}

async function renderMonth() {
    const myToken = ++renderToken;
    const container = document.getElementById("app-content");
    const todayIso = isoDate(new Date());
    const days = buildMonthGrid(viewYear, viewMonth);
    const monthLabel = new Date(viewYear, viewMonth, 1)
        .toLocaleDateString("en-US", { month: "long", year: "numeric" });

    /* Shell renders first so the user sees structure immediately. Dots
       get mounted into existing cells once the fetch resolves — no full
       re-render, no flash. */
    container.innerHTML = `
        <div class="calendar-page">
            <div class="calendar-error-banner" id="cal-error" hidden></div>

            <div class="calendar-header">
                <button class="calendar-nav-btn" id="cal-prev" aria-label="Previous month">‹</button>
                <h2 class="calendar-month-label">${escapeHtml(monthLabel)}</h2>
                <button class="calendar-nav-btn" id="cal-next" aria-label="Next month">›</button>
            </div>
            <div class="calendar-toolbar">
                <button class="calendar-today-btn" id="cal-today">Today</button>
            </div>

            <div class="calendar-weekdays">
                ${WEEKDAY_LABELS.map(d => `<div>${d}</div>`).join("")}
            </div>

            <div class="calendar-grid">
                ${days.map(d => renderCellShell(d, todayIso)).join("")}
            </div>

            <div class="calendar-legend">
                <span class="legend-item"><span class="legend-dot status-planned"></span>Planned</span>
                <span class="legend-item"><span class="legend-dot status-completed"></span>Completed</span>
                <span class="legend-item"><span class="legend-dot status-skipped"></span>Skipped</span>
            </div>
        </div>
    `;

    document.getElementById("cal-prev").onclick = function() { stepMonth(-1); renderMonth(); };
    document.getElementById("cal-next").onclick = function() { stepMonth(1); renderMonth(); };
    document.getElementById("cal-today").onclick = function() {
        const t = new Date();
        viewYear = t.getFullYear();
        viewMonth = t.getMonth();
        renderMonth();
    };

    document.querySelector(".calendar-grid").onclick = function(e) {
        const cell = e.target.closest(".calendar-cell");
        if (!cell) return;
        const iso = cell.dataset.date;
        const [y, m] = iso.split("-").map(Number);
        viewYear = y;
        viewMonth = m - 1;
        renderDayDetail(iso);
    };

    try {
        const schedules = await fetchSchedulesInRange(days[0].iso, days[days.length - 1].iso);
        if (myToken !== renderToken) return;
        mountSchedulesIntoGrid(container, schedules);
    } catch (e) {
        if (myToken !== renderToken) return;
        showErrorBanner("Couldn't load schedules. Check your connection and try again.");
    }
}

function mountSchedulesIntoGrid(container, schedules) {
    const byDate = new Map();
    for (const s of schedules) {
        if (!byDate.has(s.date)) byDate.set(s.date, []);
        byDate.get(s.date).push(s);
    }

    const MAX_VISIBLE = 6;
    container.querySelectorAll(".calendar-cell").forEach(function(cell) {
        const daySchedules = byDate.get(cell.dataset.date) || [];
        if (daySchedules.length === 0) return;

        cell.classList.add("has-schedules");
        const dotsEl = cell.querySelector(".schedule-dots");
        const visible = daySchedules.slice(0, MAX_VISIBLE);
        const overflow = daySchedules.length - visible.length;
        dotsEl.innerHTML = visible.map(function(s) {
            const name = workoutNameById(s.workoutId);
            return `<div class="schedule-dot status-${s.status.toLowerCase()}" title="${escapeHtml(name)}"></div>`;
        }).join("") + (overflow > 0 ? `<span class="schedule-overflow">+${overflow}</span>` : "");
    });
}

function stepMonth(delta) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
}

/* 6-row x 7-col grid (42 cells), Monday-start. Always 42 cells so grid
   height is stable when navigating months. */
function buildMonthGrid(year, month) {
    const first = new Date(year, month, 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - mondayOffset);

    const days = [];
    for (let i = 0; i < 42; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        days.push({
            date: d,
            iso: isoDate(d),
            inMonth: d.getMonth() === month
        });
    }
    return days;
}

function renderCellShell(day, todayIso) {
    const classes = ["calendar-cell"];
    if (!day.inMonth) classes.push("other-month");
    if (day.iso === todayIso) classes.push("today");
    return `
        <div class="${classes.join(" ")}" data-date="${day.iso}">
            <div class="calendar-day-num">${day.date.getDate()}</div>
            <div class="schedule-dots"></div>
        </div>
    `;
}

function isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function workoutNameById(workoutId) {
    const w = state.workouts.find(function(w) { return w.id === workoutId; });
    return w ? w.name : "(unknown workout)";
}

async function renderDayDetail(iso) {
    const myToken = ++renderToken;
    const container = document.getElementById("app-content");
    const todayIso = isoDate(new Date());
    const isToday = iso === todayIso;
    const isPast = iso < todayIso;
    const formattedDate = formatSessionDate(iso);
    const monthLabel = new Date(viewYear, viewMonth, 1)
        .toLocaleDateString("en-US", { month: "long", year: "numeric" });

    /* Shell renders immediately; schedules list mounts after fetch. */
    container.innerHTML = `
        <div class="day-detail-page">
            <div class="calendar-error-banner" id="cal-error" hidden></div>

            <div class="page-actions">
                <button class="btn-secondary" id="day-back">← Back to ${escapeHtml(monthLabel)}</button>
            </div>

            <h2 class="day-detail-date">
                ${isToday ? `<span class="day-detail-today-tag">Today</span> ` : ""}${escapeHtml(formattedDate)}
            </h2>

            <div class="day-detail-schedules" id="day-schedules"></div>

            ${isPast ? "" : `<button class="day-detail-add-cta" id="day-add">+ Schedule a workout for this day</button>`}
        </div>
    `;

    document.getElementById("day-back").onclick = function() { renderMonth(); };
    if (!isPast) {
        document.getElementById("day-add").onclick = function() { openScheduleModal(iso); };
    }

    let schedules;
    try {
        schedules = await fetchSchedulesByDate(iso);
    } catch (e) {
        if (myToken !== renderToken) return;
        showErrorBanner("Couldn't load this day's schedules.");
        return;
    }
    if (myToken !== renderToken) return;

    const listEl = document.getElementById("day-schedules");
    if (schedules.length === 0) {
        listEl.innerHTML = `<p class="day-detail-empty">Nothing planned for this day.</p>`;
    } else {
        listEl.innerHTML = schedules.map(renderScheduleRow).join("");
    }
}

function renderScheduleRow(s) {
    const isPlanned = s.status === "PLANNED";
    const statusLower = s.status.toLowerCase();
    const name = workoutNameById(s.workoutId);
    return `
        <div class="schedule-row" data-schedule-id="${s.id}">
            <div class="schedule-row-head">
                <span class="schedule-row-name">${escapeHtml(name)}</span>
                <span class="schedule-status-badge status-${statusLower}">${s.status}</span>
            </div>
            ${s.notes ? `<p class="schedule-notes">${escapeHtml(s.notes)}</p>` : ""}
            <div class="schedule-actions">
                <button class="schedule-action-btn" ${isPlanned ? "" : "disabled"}>Start</button>
                <button class="schedule-action-btn btn-secondary">Reschedule</button>
                <button class="schedule-action-btn btn-secondary" ${isPlanned ? "" : "disabled"}>Skip</button>
                <button class="schedule-action-btn btn-danger">Delete</button>
            </div>
        </div>
    `;
}

async function openScheduleModal(iso, openOptions) {
    const preselectWorkoutId = openOptions && openOptions.preselectWorkoutId
        ? openOptions.preselectWorkoutId
        : null;

    const result = await showScheduleModal({
        iso: iso,
        workouts: state.workouts,
        preselectWorkoutId: preselectWorkoutId,
        onSave: function(data) { return createSchedule(data); }
    });

    if (!result) return;

    if (result.action === "create-new-workout") {
        /* See "tab flash" notes: setActiveTab → renderCalendarPage paints
           never reach the screen because the .then runs before the next
           browser paint. */
        async function returnToScheduleModal(reopenOpts) {
            await setActiveTab("calendar");
            renderDayDetail(iso);
            openScheduleModal(iso, reopenOpts);
        }

        await setActiveTab("workouts");
        renderCreateWorkoutPage(undefined, {
            onBack: function() { returnToScheduleModal(undefined); },
            onCreated: function(newWorkout) {
                returnToScheduleModal({ preselectWorkoutId: newWorkout.id });
            }
        });
        return;
    }

    if (result.action === "save") {
        renderDayDetail(iso);
    }
}

function showErrorBanner(message) {
    const banner = document.getElementById("cal-error");
    if (!banner) return;
    banner.innerHTML = `
        <span class="cal-error-msg">${escapeHtml(message)}</span>
        <button class="cal-error-dismiss" aria-label="Dismiss">×</button>
    `;
    banner.hidden = false;
    banner.querySelector(".cal-error-dismiss").onclick = function() {
        banner.hidden = true;
        banner.innerHTML = "";
    };
}
