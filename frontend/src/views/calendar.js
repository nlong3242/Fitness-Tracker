import { clearNavGuard, setActiveTab } from "../components/bottomNav.js";
import { showScheduleModal } from "../components/modals.js";
import { renderCreateWorkoutPage } from "./workouts.js";
import { escapeHtml, formatSessionDate } from "../utils/format.js";

/* Mock data — swapped for fetchSchedulesInRange() in the next step.
   Picked to exercise every visual state: empty days, single pill,
   multi pill, overflow indicator, today highlight, all three statuses.
   workoutId mirrors the real shape so the modal's conflict check works. */
const MOCK_WORKOUTS = [
    { id: 1, name: "Push Day" },
    { id: 2, name: "Pull Day" },
    { id: 3, name: "Leg Day" },
    { id: 4, name: "Cardio" },
    { id: 5, name: "Mobility" },
    { id: 6, name: "Stretch" }
];

const MOCK_SCHEDULES = [
    { id: 1, date: "2026-05-04", workoutId: 1, workoutName: "Push Day", status: "COMPLETED", notes: null },
    { id: 2, date: "2026-05-06", workoutId: 2, workoutName: "Pull Day", status: "COMPLETED", notes: null },
    { id: 3, date: "2026-05-08", workoutId: 3, workoutName: "Leg Day", status: "SKIPPED", notes: null },
    { id: 4, date: "2026-05-11", workoutId: 1, workoutName: "Push Day", status: "COMPLETED", notes: null },
    { id: 5, date: "2026-05-13", workoutId: 2, workoutName: "Pull Day", status: "COMPLETED", notes: null },
    { id: 6, date: "2026-05-15", workoutId: 3, workoutName: "Leg Day", status: "COMPLETED", notes: null },
    { id: 7, date: "2026-05-18", workoutId: 1, workoutName: "Push Day", status: "COMPLETED", notes: null },
    { id: 8, date: "2026-05-20", workoutId: 2, workoutName: "Pull Day", status: "COMPLETED", notes: null },
    { id: 9, date: "2026-05-22", workoutId: 3, workoutName: "Leg Day", status: "COMPLETED", notes: null },
    { id: 10, date: "2026-05-25", workoutId: 1, workoutName: "Push Day", status: "COMPLETED", notes: null },
    { id: 11, date: "2026-05-27", workoutId: 2, workoutName: "Pull Day", status: "COMPLETED", notes: "Felt strong, hit PR on lat pulldowns" },
    { id: 12, date: "2026-05-27", workoutId: 4, workoutName: "Cardio", status: "COMPLETED", notes: null },
    { id: 13, date: "2026-05-29", workoutId: 3, workoutName: "Leg Day", status: "PLANNED", notes: "Going heavy on squats" },
    { id: 14, date: "2026-05-29", workoutId: 5, workoutName: "Mobility", status: "PLANNED", notes: null },
    { id: 15, date: "2026-05-29", workoutId: 4, workoutName: "Cardio", status: "PLANNED", notes: null },
    { id: 16, date: "2026-05-29", workoutId: 6, workoutName: "Stretch", status: "PLANNED", notes: null },
    { id: 17, date: "2026-06-01", workoutId: 1, workoutName: "Push Day", status: "PLANNED", notes: null },
    { id: 18, date: "2026-06-03", workoutId: 2, workoutName: "Pull Day", status: "PLANNED", notes: "Try the new bar grip" },
];

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

let viewYear;
let viewMonth;

export function renderCalendarPage() {
    clearNavGuard();
    if (viewYear === undefined) {
        const today = new Date();
        viewYear = today.getFullYear();
        viewMonth = today.getMonth();
    }
    renderMonth();
}

function renderMonth() {
    const container = document.getElementById("app-content");
    const todayIso = isoDate(new Date());
    const days = buildMonthGrid(viewYear, viewMonth);
    const monthLabel = new Date(viewYear, viewMonth, 1)
        .toLocaleDateString("en-US", { month: "long", year: "numeric" });

    container.innerHTML = `
        <div class="calendar-page">
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
                ${days.map(d => renderCell(d, todayIso)).join("")}
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

    /* Cell tap → day detail. Event delegation on the grid so we only
       wire one listener regardless of cell count. Tapping an off-month
       cell first pulls viewMonth onto that day's month, so backing out
       lands on the right month. */
    document.querySelector(".calendar-grid").onclick = function(e) {
        const cell = e.target.closest(".calendar-cell");
        if (!cell) return;
        const iso = cell.dataset.date;
        const [y, m] = iso.split("-").map(Number);
        viewYear = y;
        viewMonth = m - 1;
        renderDayDetail(iso);
    };
}

function stepMonth(delta) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
}

/* Builds a 6-row x 7-col grid (42 cells) starting on the Monday of the
   week that contains the 1st. Always 42 cells so grid height is stable
   when navigating between months. */
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

function renderCell(day, todayIso) {
    const classes = ["calendar-cell"];
    if (!day.inMonth) classes.push("other-month");
    if (day.iso === todayIso) classes.push("today");

    const schedules = MOCK_SCHEDULES.filter(s => s.date === day.iso);
    if (schedules.length) classes.push("has-schedules");

    const MAX_VISIBLE = 6;
    const visible = schedules.slice(0, MAX_VISIBLE);
    const overflow = schedules.length - visible.length;

    return `
        <div class="${classes.join(" ")}" data-date="${day.iso}">
            <div class="calendar-day-num">${day.date.getDate()}</div>
            <div class="schedule-dots">
                ${visible.map(s => `
                    <div class="schedule-dot status-${s.status.toLowerCase()}" title="${escapeHtml(s.workoutName)}"></div>
                `).join("")}
                ${overflow > 0 ? `<span class="schedule-overflow">+${overflow}</span>` : ""}
            </div>
        </div>
    `;
}

function isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function renderDayDetail(iso) {
    const container = document.getElementById("app-content");
    const todayIso = isoDate(new Date());
    const isToday = iso === todayIso;
    const isPast = iso < todayIso;
    const formattedDate = formatSessionDate(iso);
    const schedules = MOCK_SCHEDULES.filter(s => s.date === iso);
    const monthLabel = new Date(viewYear, viewMonth, 1)
        .toLocaleDateString("en-US", { month: "long", year: "numeric" });

    container.innerHTML = `
        <div class="day-detail-page">
            <div class="page-actions">
                <button class="btn-secondary" id="day-back">← Back to ${escapeHtml(monthLabel)}</button>
            </div>

            <h2 class="day-detail-date">
                ${isToday ? `<span class="day-detail-today-tag">Today</span> ` : ""}${escapeHtml(formattedDate)}
            </h2>

            <div class="day-detail-schedules">
                ${schedules.length === 0
                    ? `<p class="day-detail-empty">Nothing planned for this day.</p>`
                    : schedules.map(renderScheduleRow).join("")}
            </div>

            ${isPast ? "" : `<button class="day-detail-add-cta" id="day-add">+ Schedule a workout for this day</button>`}
        </div>
    `;

    document.getElementById("day-back").onclick = function() { renderMonth(); };

    if (!isPast) {
        document.getElementById("day-add").onclick = function() { openScheduleModal(iso); };
    }
    /* Per-row action buttons (Start / Reschedule / Skip / Delete)
       stay unwired here — steps 6/7. */
}

async function openScheduleModal(iso) {
    const result = await showScheduleModal({
        iso: iso,
        workouts: MOCK_WORKOUTS,
        conflictChecker: function(date, workoutId) {
            return MOCK_SCHEDULES.some(s => s.date === date && s.workoutId === workoutId);
        }
    });

    if (!result) return;

    if (result.action === "create-new-workout") {
        await setActiveTab("workouts");
        renderCreateWorkoutPage();
        return;
    }

    if (result.action === "save") {
        const workout = MOCK_WORKOUTS.find(w => w.id === result.data.workoutId);
        const nextId = MOCK_SCHEDULES.length === 0
            ? 1
            : Math.max(...MOCK_SCHEDULES.map(s => s.id)) + 1;
        MOCK_SCHEDULES.push({
            id: nextId,
            date: result.data.date,
            workoutId: result.data.workoutId,
            workoutName: workout ? workout.name : "(unknown)",
            status: "PLANNED",
            notes: result.data.notes
        });
        /* Land on the new schedule's day — if the user changed the date
           in the modal, this is the most useful confirmation that the
           save took effect. */
        renderDayDetail(result.data.date);
    }
}

function renderScheduleRow(s) {
    const isPlanned = s.status === "PLANNED";
    const statusLower = s.status.toLowerCase();
    return `
        <div class="schedule-row" data-schedule-id="${s.id}">
            <div class="schedule-row-head">
                <span class="schedule-row-name">${escapeHtml(s.workoutName)}</span>
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
