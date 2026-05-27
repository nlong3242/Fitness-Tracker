import { clearNavGuard } from "../components/bottomNav.js";
import { escapeHtml } from "../utils/format.js";

/* Mock data — swapped for fetchSchedulesInRange() in the next step.
   Picked to exercise every visual state: empty days, single pill,
   multi pill, overflow indicator, today highlight, all three statuses. */
const MOCK_SCHEDULES = [
    { id: 1, date: "2026-05-04", workoutName: "Push Day", status: "COMPLETED" },
    { id: 2, date: "2026-05-06", workoutName: "Pull Day", status: "COMPLETED" },
    { id: 3, date: "2026-05-08", workoutName: "Leg Day", status: "SKIPPED" },
    { id: 4, date: "2026-05-11", workoutName: "Push Day", status: "COMPLETED" },
    { id: 5, date: "2026-05-13", workoutName: "Pull Day", status: "COMPLETED" },
    { id: 6, date: "2026-05-15", workoutName: "Leg Day", status: "COMPLETED" },
    { id: 7, date: "2026-05-18", workoutName: "Push Day", status: "COMPLETED" },
    { id: 8, date: "2026-05-20", workoutName: "Pull Day", status: "COMPLETED" },
    { id: 9, date: "2026-05-22", workoutName: "Leg Day", status: "COMPLETED" },
    { id: 10, date: "2026-05-25", workoutName: "Push Day", status: "COMPLETED" },
    { id: 11, date: "2026-05-27", workoutName: "Pull Day", status: "COMPLETED" },
    { id: 12, date: "2026-05-27", workoutName: "Cardio", status: "COMPLETED" },
    { id: 13, date: "2026-05-29", workoutName: "Leg Day", status: "PLANNED" },
    { id: 14, date: "2026-05-29", workoutName: "Mobility", status: "PLANNED" },
    { id: 15, date: "2026-05-29", workoutName: "Cardio", status: "PLANNED" },
    { id: 16, date: "2026-05-29", workoutName: "Stretch", status: "PLANNED" },
    { id: 17, date: "2026-06-01", workoutName: "Push Day", status: "PLANNED" },
    { id: 18, date: "2026-06-03", workoutName: "Pull Day", status: "PLANNED" },
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
