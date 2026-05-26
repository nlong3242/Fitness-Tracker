import { state } from "../state.js";
import {
    fetchSessionExercises,
    fetchSessionSets,
    fetchLastSets,
    fetchPreviousTotals
} from "../api.js";
import { deltaSpan, formatSessionDate } from "../utils/format.js";
import { showExerciseReadOnlyModal } from "../components/modals.js";
import { createNotesPanel } from "../components/notesPanel.js";
import { viewWorkout } from "./workoutDetail.js";

export async function viewSessionSummary(workoutIndex, sessionId, sessionDate, onBack) {
    const workout = state.workouts[workoutIndex];

    const snapshotExercises = await fetchSessionExercises(sessionId);
    const sets = await fetchSessionSets(sessionId);

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

    const back = onBack || function() { viewWorkout(workoutIndex); };
    await renderWorkoutSummary(workout, sessionId, sessionDate, back);
}

export async function renderWorkoutSummary(workout, sessionId, sessionDate, onBack) {
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

    const formattedDate = formatSessionDate(sessionDate);

    const prevTotalsResponse = await fetchPreviousTotals(workout.id, sessionId);
    let exercisesDelta = "", setsDelta = "", repsDelta = "", volumeDelta = "";
    if (prevTotalsResponse.ok) {
        const prev = await prevTotalsResponse.json();
        exercisesDelta = deltaSpan(exercisesCount - prev.exercises);
        setsDelta = deltaSpan(setsCount - prev.sets);
        repsDelta = deltaSpan(repsTotal - prev.reps);
        volumeDelta = deltaSpan(volumeTotal - prev.volume);
    }

    const container = document.getElementById("container");
    container.innerHTML = `
        <h2>Workout Summary - ${workout.name}</h2>
        <div class="summary-date">${formattedDate}</div>
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
        <div class="page-actions">
            <button class="btn-secondary" id="summary-back-btn">Back</button>
        </div>
    `;

    document.getElementById("summary-back-btn").onclick = onBack;

    const exercisesContainer = document.getElementById("summary-exercises");
    for (const exercise of workout.exercises) {
        const lastSets = await fetchLastSets(workout.id, exercise.id, sessionId);
        const isUnilateral = exercise.unilateral === true;

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
                const emptyCell = `<div class="summary-set-cell summary-set-empty">-</div>`;
                for (let k = 0; k < pairs; k++) {
                    const L = leftSets[k];
                    const R = rightSets[k];
                    if (L) {
                        const prev = prevLeft[k];
                        const wd = prev ? deltaSpan(L.weight - prev.weight) : "";
                        const rd = prev ? deltaSpan(L.reps - prev.reps) : "";
                        rows += `
                            <div class="summary-set-row">
                                <div class="summary-set-num">Set L${k + 1}</div>
                                <div class="summary-set-cell">${L.weight}${wd}</div>
                                <div class="summary-set-cell">${L.reps}${rd}</div>
                            </div>
                        `;
                    } else {
                        rows += `
                            <div class="summary-set-row">
                                <div class="summary-set-num">Set L${k + 1}</div>
                                ${emptyCell}
                                ${emptyCell}
                            </div>
                        `;
                    }
                    if (R) {
                        const prev = prevRight[k];
                        const wd = prev ? deltaSpan(R.weight - prev.weight) : "";
                        const rd = prev ? deltaSpan(R.reps - prev.reps) : "";
                        rows += `
                            <div class="summary-set-row">
                                <div class="summary-set-num">Set R${k + 1}</div>
                                <div class="summary-set-cell">${R.weight}${wd}</div>
                                <div class="summary-set-cell">${R.reps}${rd}</div>
                            </div>
                        `;
                    } else {
                        rows += `
                            <div class="summary-set-row">
                                <div class="summary-set-num">Set R${k + 1}</div>
                                ${emptyCell}
                                ${emptyCell}
                            </div>
                        `;
                    }
                }
            } else {
                for (let k = 0; k < exercise.sets.length; k++) {
                    const set = exercise.sets[k];
                    const prev = lastSets[k];
                    let weightDelta = "";
                    let repsDelta = "";
                    if (prev) {
                        weightDelta = deltaSpan(set.weight - prev.weight);
                        repsDelta = deltaSpan(set.reps - prev.reps);
                    }
                    rows += `
                        <div class="summary-set-row">
                            <div class="summary-set-num">Set ${String(k + 1).padStart(2, "0")}</div>
                            <div class="summary-set-cell">${set.weight}${weightDelta}</div>
                            <div class="summary-set-cell">${set.reps}${repsDelta}</div>
                        </div>
                    `;
                }
            }
            setsTableHtml = `
                <div class="summary-set-header">
                    <div class="summary-set-num"></div>
                    <div class="summary-set-cell">Weight <span class="stat-unit">(kg)</span></div>
                    <div class="summary-set-cell">Reps</div>
                </div>
                ${rows}
            `;
        }

        const exerciseCard = document.createElement("div");
        exerciseCard.className = "summary-exercise-card";
        exerciseCard.innerHTML = `
            <div class="summary-exercise-name">${exercise.name}</div>
            <div class="summary-exercise-count">${exercise.sets.length} sets</div>
            ${setsTableHtml}
        `;
        exerciseCard.querySelector(".summary-exercise-name").onclick = function() {
            showExerciseReadOnlyModal(exercise);
        };
        exerciseCard.appendChild(createNotesPanel(exercise));

        exercisesContainer.appendChild(exerciseCard);
    }
}
