import { clearNavGuard, setActiveTab } from "../components/bottomNav.js";
import {
    showScheduleModal,
    showRescheduleModal,
    showConfirmModal
} from "../components/modals.js";
import { renderCreateWorkoutPage } from "./workouts.js";
import { startWorkout } from "./activeWorkout.js";
import { viewSessionSummary } from "./summary.js";
import { viewWorkout } from "./workoutDetail.js";
import { escapeHtml, formatSessionDate } from "../utils/format.js";
import {
    fetchWorkouts,
    fetchSchedulesInRange,
    fetchSchedulesByDate,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    deleteSession,
    fetchSessionSets
} from "../api.js";
import { state, findWorkout } from "../state.js";
import { setRoute } from "../router.js";

/* state.workouts is loaded once at startup; exerciseCount goes stale
   whenever the user links or unlinks an exercise elsewhere. Refresh
   on every entry into the calendar so the Start gate (which depends
   on exerciseCount) reflects the current backend state. */
async function refreshWorkoutsCache() {
    try { state.workouts = await fetchWorkouts(); }
    catch (e) { /* keep the stale cache rather than blanking the UI */ }
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

let viewYear;
let viewMonth;

/* renderToken invalidates in-flight fetches whose paint would land on a
   view the user has already navigated away from. Every render bumps it;
   each fetch captures the value at call time and bails on mismatch. */
let renderToken = 0;

export async function renderCalendarPage() {
    clearNavGuard();
    if (viewYear === undefined) {
        const today = new Date();
        viewYear = today.getFullYear();
        viewMonth = today.getMonth();
    }
    /* Callers like navigateToCalendarDay call setActiveTab("calendar") and
       then immediately paint the day detail, which lands while this fetch
       is still in flight. If any calendar view rendered in the meantime,
       don't paint the month grid over it. */
    const tokenAtStart = renderToken;
    await refreshWorkoutsCache();
    if (renderToken !== tokenAtStart) return;
    renderMonth();
}

/* External callers (e.g., workoutDetail's Schedule button) use this to
   jump straight to a day's detail. Aligns viewYear/viewMonth so the
   bottom-nav tap on Calendar lands on the right month grid.
   renderCalendarPage (kicked off by setActiveTab) skips its month paint
   when renderDayDetail has rendered first — see the token check there. */
export async function navigateToCalendarDay(iso) {
    const [y, m] = iso.split("-").map(Number);
    viewYear = y;
    viewMonth = m - 1;
    /* Refresh BEFORE setActiveTab so renderDayDetail (fire-and-forget
       after setActiveTab returns) sees fresh data — setActiveTab's
       internal renderCalendarPage call races concurrently. */
    await refreshWorkoutsCache();
    await setActiveTab("calendar");
    renderDayDetail(iso);
}

// Open the calendar on a given month (month is 0-based), e.g. on reload.
export async function navigateToCalendarMonth(year, month) {
    viewYear = year;
    viewMonth = month;
    await setActiveTab("calendar");
}

async function renderMonth() {
    const myToken = ++renderToken;
    setRoute(`#/calendar/${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`);
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
    const todayIso = isoDate(new Date());
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
            const display = effectiveStatus(s, todayIso).toLowerCase();
            return `<div class="schedule-dot status-${display}" title="${escapeHtml(name)}"></div>`;
        }).join("") + (overflow > 0 ? `<span class="schedule-overflow">+${overflow}</span>` : "");
    });
}

/* Display-only rule: a PLANNED schedule whose date is in the past is
   shown as SKIPPED (user didn't do it on time). The DB row keeps its
   PLANNED status — this is purely how we render. Once stats or
   reporting need a canonical value the backend can promote this. */
function effectiveStatus(schedule, todayIso) {
    if (schedule.status === "PLANNED" && schedule.date < todayIso) {
        return "SKIPPED";
    }
    return schedule.status;
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

function workoutExerciseCount(workoutId) {
    const w = state.workouts.find(function(w) { return w.id === workoutId; });
    return w ? w.exerciseCount : 0;
}

async function renderDayDetail(iso) {
    const myToken = ++renderToken;
    setRoute(`#/calendar/${iso}`);
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
    schedules = await labelSessions(schedules);
    if (myToken !== renderToken) return;

    const listEl = document.getElementById("day-schedules");
    if (schedules.length === 0) {
        listEl.innerHTML = `<p class="day-detail-empty">Nothing planned for this day.</p>`;
    } else {
        listEl.innerHTML = schedules.map(function(s) {
            return renderScheduleRow(s, todayIso);
        }).join("");
        wireScheduleRowActions(listEl, schedules, iso);
    }
}

/* Every COMPLETED row linked to a session gets "Session N · M sets": N
   counts that workout's sessions on the day in session order (so a
   workout done twice reads Session 1, Session 2) and a repeated workout's rows are listed in
   that order. PLANNED/SKIPPED rows have no session and stay unlabelled.
   Returns the (re-ordered) list. */
async function labelSessions(schedules) {
    const byWorkout = new Map();
    for (const s of schedules) {
        if (s.status !== "COMPLETED" || s.sessionId == null) continue;
        if (!byWorkout.has(s.workoutId)) byWorkout.set(s.workoutId, []);
        byWorkout.get(s.workoutId).push(s);
    }
    const groups = [...byWorkout.values()];
    if (groups.length === 0) return schedules;

    await Promise.all(groups.flat().map(async function(s) {
        try { s._setCount = (await fetchSessionSets(s.sessionId)).length; }
        catch (e) { s._setCount = null; } // label still shows the session number
    }));
    for (const group of groups) {
        group.sort((a, b) => a.sessionId - b.sessionId);
        group.forEach(function(s, i) {
            const sets = s._setCount == null ? ""
                : ` · ${s._setCount} ${s._setCount === 1 ? "set" : "sets"}`;
            s._sessionLabel = `Session ${i + 1}${sets}`;
        });
    }
    // Keep the day's order, but list each group's rows in session order,
    // at the position of the group's first row.
    const ordered = [];
    const placed = new Set();
    for (const s of schedules) {
        const group = groups.find(g => g.includes(s));
        if (!group) { ordered.push(s); continue; }
        if (placed.has(group)) continue;
        placed.add(group);
        ordered.push(...group);
    }
    return ordered;
}

function renderScheduleRow(s, todayIso) {
    const displayStatus = effectiveStatus(s, todayIso);
    /* Start additionally requires the workout to have at least one
       exercise — same rule as workoutDetail's Start button. Prevents
       landing on an empty preview page with nothing to do. */
    const hasExercises = workoutExerciseCount(s.workoutId) > 0;
    const isStartable = displayStatus === "PLANNED" && hasExercises;
    /* Reschedule stays disabled on COMPLETED rows (moving a workout that
       already happened makes no sense), but Delete is always available:
       on COMPLETED rows it removes the entry and its finished session. */
    const isEditable = displayStatus !== "COMPLETED";
    /* Row body is clickable in two cases, dispatched via data-click-target:
       - COMPLETED + sessionId → opens that session's summary.
       - PLANNED / SKIPPED → opens the workout's detail page (useful for
         inspecting or editing the workout before its scheduled date,
         and gives users a path forward when Start is disabled because
         the workout has no exercises yet).
       COMPLETED rows without a sessionId are pre-link historical rows and
       silently stay non-clickable. */
    const clickTarget = (displayStatus === "COMPLETED" && s.sessionId != null) ? "summary"
        : (displayStatus === "PLANNED" || displayStatus === "SKIPPED") ? "workout"
        : null;
    const isSkippable = displayStatus === "PLANNED";
    const statusLower = displayStatus.toLowerCase();
    const name = workoutNameById(s.workoutId);
    return `
        <div class="schedule-row${clickTarget ? " clickable" : ""}" data-schedule-id="${s.id}"${clickTarget ? ` data-click-target="${clickTarget}"` : ""}>
            <div class="schedule-row-head">
                <span class="schedule-row-name">${escapeHtml(name)}${s._sessionLabel ? `<span class="schedule-row-sub">${escapeHtml(s._sessionLabel)}</span>` : ""}</span>
                <span class="schedule-status-badge status-${statusLower}">${displayStatus}</span>
            </div>
            ${s.notes ? `<p class="schedule-notes">${escapeHtml(s.notes)}</p>` : ""}
            <div class="schedule-actions">
                <button class="schedule-action-btn" data-action="start" ${isStartable ? "" : "disabled"}>Start</button>
                <button class="schedule-action-btn btn-secondary" data-action="reschedule" ${isEditable ? "" : "disabled"}>Reschedule</button>
                <button class="schedule-action-btn btn-secondary" data-action="skip" ${isSkippable ? "" : "disabled"}>Skip</button>
                <button class="schedule-action-btn btn-danger" data-action="delete">Delete</button>
            </div>
        </div>
    `;
}

/* Per-row interactions are wired via delegation on the schedules container —
   one listener regardless of row count. Handles both action-button clicks
   and (for COMPLETED rows linked to a session) row-body clicks that
   navigate to the session summary. */
function wireScheduleRowActions(listEl, schedules, dayIso) {
    listEl.onclick = function(e) {
        const row = e.target.closest(".schedule-row");
        if (!row) return;
        const scheduleId = Number(row.dataset.scheduleId);
        const schedule = schedules.find(function(s) { return s.id === scheduleId; });
        if (!schedule) return;

        const btn = e.target.closest(".schedule-action-btn");
        if (btn) {
            if (btn.disabled) return;
            const action = btn.dataset.action;
            if (action === "start") startFromSchedule(schedule, dayIso);
            else if (action === "skip") skipSchedule(schedule, dayIso, btn);
            else if (action === "delete") deleteScheduleAction(schedule, dayIso, btn);
            else if (action === "reschedule") rescheduleSchedule(schedule, dayIso, btn);
            return;
        }

        if (!row.classList.contains("clickable")) return;
        const target = row.dataset.clickTarget;
        if (target === "summary") openSessionSummaryFromSchedule(schedule, dayIso);
        else if (target === "workout") openWorkoutDetailFromSchedule(schedule);
    };
}

function openSessionSummaryFromSchedule(schedule, dayIso) {
    if (!findWorkout(schedule.workoutId)) {
        showErrorBanner("Couldn't find this workout — it may have been deleted.");
        return;
    }
    viewSessionSummary(schedule.workoutId, schedule.sessionId, schedule.date, function() {
        setActiveTab("calendar");
        renderDayDetail(dayIso);
    }, `#/calendar/${dayIso}/sessions/${schedule.sessionId}?workout=${schedule.workoutId}`);
}

/* Cross-tab navigation: setActiveTab first so the bottom-nav highlights
   the Workouts tab (otherwise Calendar stays highlighted while the user
   is looking at workoutDetail). viewWorkout immediately overrides the
   default workouts-list paint, same trick navigateToCalendarDay uses. */
async function openWorkoutDetailFromSchedule(schedule) {
    if (!findWorkout(schedule.workoutId)) {
        showErrorBanner("Couldn't find this workout — it may have been deleted.");
        return;
    }
    await setActiveTab("workouts");
    viewWorkout(schedule.workoutId);
}

function startFromSchedule(schedule, dayIso) {
    if (!findWorkout(schedule.workoutId)) {
        showErrorBanner("Couldn't find this workout — it may have been deleted.");
        return;
    }
    startWorkout(schedule.workoutId, {
        scheduledWorkoutId: schedule.id,
        onComplete: function() {
            setActiveTab("calendar");
            renderDayDetail(dayIso);
        }
    });
}

async function skipSchedule(schedule, dayIso, btn) {
    btn.disabled = true;
    const name = workoutNameById(schedule.workoutId);
    const confirmed = await showConfirmModal(
        `Skip "${name}" on this day?`,
        "Skip"
    );
    if (!confirmed) {
        btn.disabled = false;
        return;
    }
    try {
        const resp = await updateSchedule(schedule.id, { status: "SKIPPED" });
        if (!resp.ok) {
            showErrorBanner("Couldn't mark this as skipped. Please try again.");
            btn.disabled = false;
            return;
        }
    } catch (e) {
        showErrorBanner("Couldn't reach the server.");
        btn.disabled = false;
        return;
    }
    renderDayDetail(dayIso);
}

async function deleteScheduleAction(schedule, dayIso, btn) {
    btn.disabled = true;
    const name = workoutNameById(schedule.workoutId)
        + (schedule._sessionLabel ? ` (${schedule._sessionLabel})` : "");
    /* COMPLETED rows linked to a session delete the workout history too;
       everything else (PLANNED, SKIPPED, pre-link COMPLETED rows) only
       removes the calendar entry. */
    const deletesSession = schedule.status === "COMPLETED" && schedule.sessionId != null;
    const confirmed = await showConfirmModal(
        deletesSession
            ? `Delete "${name}" and its finished session from this day? Its sets are removed permanently.`
            : `Delete the scheduled "${name}" for this day?`,
        "Delete"
    );
    if (!confirmed) {
        btn.disabled = false;
        return;
    }
    try {
        if (deletesSession) {
            const sessionResp = await deleteSession(schedule.sessionId);
            if (!sessionResp.ok) {
                showErrorBanner("Couldn't delete this session. Please try again.");
                btn.disabled = false;
                return;
            }
        }
        const resp = await deleteSchedule(schedule.id);
        if (!resp.ok) {
            showErrorBanner("Couldn't delete this schedule. Please try again.");
            btn.disabled = false;
            return;
        }
    } catch (e) {
        showErrorBanner("Couldn't reach the server.");
        btn.disabled = false;
        return;
    }
    renderDayDetail(dayIso);
}

async function rescheduleSchedule(schedule, dayIso, btn) {
    btn.disabled = true;
    const todayIso = isoDate(new Date());
    const result = await showRescheduleModal({
        currentIso: schedule.date,
        todayIso: todayIso,
        onSave: function(newDate) {
            /* If the schedule was explicitly SKIPPED, treat reschedule as
               an implicit un-skip → flip back to PLANNED with the new date.
               Past-PLANNED schedules are PLANNED in the DB (only display
               flips to SKIPPED), so this branch only fires for genuine
               user-skipped rows. COMPLETED and PLANNED rows keep their
               status. */
            const body = (schedule.status === "SKIPPED")
                ? { date: newDate, status: "PLANNED" }
                : { date: newDate };
            return updateSchedule(schedule.id, body);
        }
    });

    if (!result) {
        btn.disabled = false;
        return;
    }

    const newDate = result.schedule.date;
    const [y, m] = newDate.split("-").map(Number);
    viewYear = y;
    viewMonth = m - 1;
    renderDayDetail(newDate);
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
