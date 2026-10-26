import { findWorkout } from "../state.js";
import {
    fetchSessionExercises,
    fetchSessionSets,
    fetchLastSets,
    fetchPreviousTotals
} from "../api.js";
import { deltaSpan, formatDecimal, formatDuration, formatSessionDate, escapeHtml } from "../utils/format.js";
import { logColumns } from "../config.js";
import { showExerciseReadOnlyModal } from "../components/modals.js";
import { createNotesPanel } from "../components/notesPanel.js";
import { clearNavGuard } from "../components/bottomNav.js";
import { viewWorkout } from "./workoutDetail.js";
import { setRoute } from "../router.js";

/* route: where the summary was opened from, as a hash route (router.js);
   defaults to the workout's past sessions. */
export async function viewSessionSummary(workoutId, sessionId, sessionDate, onBack, route) {
    clearNavGuard();
    const workout = findWorkout(workoutId);

    const snapshotExercises = await fetchSessionExercises(sessionId);
    const sets = await fetchSessionSets(sessionId);
    setRoute(route || sessionSummaryRoute(workoutId, sessionId, sessionDate));

    const setsByExerciseId = new Map();
    for (const set of sets) {
        if (!setsByExerciseId.has(set.exerciseId)) {
            setsByExerciseId.set(set.exerciseId, []);
        }
        setsByExerciseId.get(set.exerciseId).push(set);
    }

    for (const snapshot of snapshotExercises) {
        snapshot.id = snapshot.exerciseId;
        snapshot.sets = setsByExerciseId.get(snapshot.exerciseId) || [];
    }
    workout.exercises = snapshotExercises;

    const back = onBack || function() { viewWorkout(workoutId); };
    await renderWorkoutSummary(workout, sessionId, sessionDate, { onBack: back });
}

/* A summary set table's columns (the set's logColumns): heading, value,
   and the change from last time's set. */
const SUMMARY_COLUMNS = {
    weight: {
        header: `Weight <span class="stat-unit">(kg)</span>`,
        value: s => s.weight,
        delta: (s, p) => deltaSpan(s.weight - p.weight, formatDecimal)
    },
    reps: {
        header: "Reps",
        value: s => s.reps,
        delta: (s, p) => deltaSpan(s.reps - p.reps)
    },
    km: {
        header: `Distance <span class="stat-unit">(km)</span>`,
        value: s => s.distanceKm != null ? formatDecimal(s.distanceKm) : "–",
        delta: (s, p) => s.distanceKm != null && p.distanceKm != null
            ? deltaSpan(s.distanceKm - p.distanceKm, formatDecimal) : ""
    },
    time: {
        header: "Time",
        value: s => formatDuration(s.durationSeconds),
        delta: (s, p) => deltaSpan(s.durationSeconds - p.durationSeconds, formatDuration)
    }
};

/* One set's row; "-" in each column when there's no set (one side of a
   unilateral pair). Last time's set is compared only if it was logged the
   same way: "last time" follows the exercise's type now, and an older
   session may have been logged as another. */
function setRowHtml(label, columns, set, prev) {
    const comparable = set && prev && (prev.logType || "WEIGHT_REPS") === (set.logType || "WEIGHT_REPS");
    const cells = columns.map(col => set
        ? `<div class="summary-set-cell">${SUMMARY_COLUMNS[col].value(set)}${comparable ? SUMMARY_COLUMNS[col].delta(set, prev) : ""}</div>`
        : `<div class="summary-set-cell summary-set-empty">-</div>`).join("");
    return `
        <div class="summary-set-row" data-cols="${columns.length}">
            <div class="summary-set-num">${label}</div>
            ${cells}
        </div>
    `;
}

export function sessionSummaryRoute(workoutId, sessionId, sessionDate) {
    return `#/workouts/${workoutId}/sessions/${sessionId}?date=${sessionDate}`;
}

/* options: { onBack, target?, mode?, onFinish?, backLabel?, headingPrefix?,
              onExerciseClick? }
   - target: element to write into (defaults to #app-content)
   - mode: "final" (default) or "preview" — preview adds a Finish button and
     skips the previous-totals fetch (no completed session to compare against)
   - onFinish: required when mode is "preview"
   - headingPrefix: text before workout name (default "Workout Summary -")
   - onExerciseClick(exercise): when provided, each summary exercise card
     becomes clickable and calls this with the exercise reference instead
     of opening the read-only modal */
export async function renderWorkoutSummary(workout, sessionId, sessionDate, options) {
    const opts = options || {};
    const onBack = opts.onBack;
    const target = opts.target || document.getElementById("app-content");
    const mode = opts.mode || "final";
    const onFinish = opts.onFinish;
    const onExerciseClick = opts.onExerciseClick;
    const backLabel = opts.backLabel || "Back";
    const headingPrefix = opts.headingPrefix || "Workout Summary -";

    if (mode === "final") clearNavGuard();

    let exercisesCount = 0;
    let setsCount = 0;
    let repsTotal = 0;
    let volumeTotal = 0;
    for (const exercise of workout.exercises) {
        if (exercise.sets.length > 0) {
            exercisesCount++;
        }
        for (const set of exercise.sets) {
            setsCount++;
            repsTotal += set.reps;
            volumeTotal += set.weight * set.reps;
        }
    }

    const formattedDate = sessionDate ? formatSessionDate(sessionDate) : "";

    let exercisesDelta = "", setsDelta = "", repsDelta = "", volumeDelta = "";
    if (mode === "final" && sessionId !== null) {
        const prevTotalsResponse = await fetchPreviousTotals(workout.id, sessionId);
        if (prevTotalsResponse.ok) {
            const prev = await prevTotalsResponse.json();
            exercisesDelta = deltaSpan(exercisesCount - prev.exercises);
            setsDelta = deltaSpan(setsCount - prev.sets);
            repsDelta = deltaSpan(repsTotal - prev.reps);
            volumeDelta = deltaSpan(volumeTotal - prev.volume);
        }
    }

    const actionsHtml = mode === "preview"
        ? `
            <div class="page-actions">
                <button id="summary-finish-btn">Finish Workout</button>
            </div>
        `
        : "";

    // A finished session's Back sits on top, like every page's; the live
    // workout's preview keeps its small "‹ Back" link.
    const topBackHtml = mode === "preview"
        ? (onBack ? `<button class="summary-back-link" id="summary-top-back-btn"><span class="summary-back-glyph">&#8249;</span> Back</button>` : "")
        : `<div class="page-actions page-top"><button class="btn-secondary" id="summary-back-btn">${backLabel}</button></div>`;

    target.innerHTML = `
        ${topBackHtml}
        <h2 class="page-title">${headingPrefix} ${escapeHtml(workout.name)}</h2>
        ${formattedDate ? `<div class="summary-date">${formattedDate}</div>` : ""}
        <div class="summary-stats">
            <div class="stat-box">
                <div class="stat-label">Exercises</div>
                <div class="stat-value">${exercisesCount}${exercisesDelta}</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">Sets</div>
                <div class="stat-value">${setsCount}${setsDelta}</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">Reps</div>
                <div class="stat-value">${repsTotal}${repsDelta}</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">Volume<span class="stat-unit">(kg)</span></div>
                <div class="stat-value">${volumeTotal}${volumeDelta}</div>
            </div>
        </div>
        <div id="summary-exercises"></div>
        ${actionsHtml}
    `;

    if (mode === "preview") {
        target.querySelector("#summary-finish-btn").onclick = onFinish;
        const topBack = target.querySelector("#summary-top-back-btn");
        if (topBack) topBack.onclick = onBack;
    } else {
        target.querySelector("#summary-back-btn").onclick = onBack;
    }

    const exercisesContainer = target.querySelector("#summary-exercises");
    for (const exercise of workout.exercises) {
        const lastSets = await fetchLastSets(workout.id, exercise.id, sessionId);
        const isUnilateral = exercise.unilateral === true;

        const columns = logColumns(exercise.logType);
        let setsTableHtml = "";
        if (exercise.sets.length > 0) {
            let rows = "";
            if (isUnilateral) {
                const byId = (a, b) => a.id - b.id;
                const leftSets = exercise.sets.filter(s => s.side === "LEFT").sort(byId);
                const rightSets = exercise.sets.filter(s => s.side === "RIGHT").sort(byId);
                const prevLeft = lastSets.filter(s => s.side === "LEFT");
                const prevRight = lastSets.filter(s => s.side === "RIGHT");
                const pairs = Math.max(leftSets.length, rightSets.length);
                for (let k = 0; k < pairs; k++) {
                    rows += setRowHtml(`Set L${k + 1}`, columns, leftSets[k], prevLeft[k]);
                    rows += setRowHtml(`Set R${k + 1}`, columns, rightSets[k], prevRight[k]);
                }
            } else {
                for (let k = 0; k < exercise.sets.length; k++) {
                    rows += setRowHtml(`Set ${String(k + 1).padStart(2, "0")}`, columns, exercise.sets[k], lastSets[k]);
                }
            }
            setsTableHtml = `
                <div class="summary-set-header" data-cols="${columns.length}">
                    <div class="summary-set-num"></div>
                    ${columns.map(col => `<div class="summary-set-cell">${SUMMARY_COLUMNS[col].header}</div>`).join("")}
                </div>
                ${rows}
            `;
        }

        const exerciseCard = document.createElement("div");
        exerciseCard.className = "summary-exercise-card";
        if (onExerciseClick) exerciseCard.classList.add("clickable");
        exerciseCard.innerHTML = `
            <div class="summary-exercise-name">${escapeHtml(exercise.name)}</div>
            <div class="summary-exercise-count">${exercise.sets.length} ${exercise.sets.length === 1 ? "set" : "sets"}</div>
            ${setsTableHtml}
        `;
        if (onExerciseClick) {
            exerciseCard.onclick = function() { onExerciseClick(exercise); };
        } else {
            exerciseCard.querySelector(".summary-exercise-name").onclick = function() {
                showExerciseReadOnlyModal(exercise);
            };
            exerciseCard.appendChild(createNotesPanel(exercise));
        }

        exercisesContainer.appendChild(exerciseCard);
    }
}
