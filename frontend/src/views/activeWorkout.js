import { state } from "../state.js";
import {
    fetchWorkoutExercises,
    fetchLastSets,
    finishSession
} from "../api.js";
import { attachLongPressDrag } from "../utils/dragDrop.js";
import { showExerciseReadOnlyModal, showConfirmModal } from "../components/modals.js";
import { createNotesPanel } from "../components/notesPanel.js";
import {
    createInputRow,
    updateHeaderVisibility,
    renumberSetRows
} from "../components/setInputRow.js";
import { setNavGuard, clearNavGuard } from "../components/bottomNav.js";
import { abandonSession } from "../session.js";
import { renderWorkouts } from "./workouts.js";
import { renderWorkoutSummary } from "./summary.js";

export async function startWorkout(workoutIndex) {
    const workout = state.workouts[workoutIndex];

    const exercises = await fetchWorkoutExercises(workout.id);
    exercises.forEach(ex => ex.sets = []);
    workout.exercises = exercises;

    // Session is created lazily — only when the first set is logged.
    state.currentSessionId = null;
    state.currentSessionDate = null;

    const pageContainer = document.getElementById("app-content");
    pageContainer.innerHTML = `
        <h2>${workout.name} - Workout</h2>
        <div id="exercise-cards"></div>
        <div class="page-actions">
            <button id="active-workout-finish-btn">Finish Workout</button>
        </div>
    `;

    document.getElementById("active-workout-finish-btn").onclick = function() { finishWorkout(workoutIndex); };

    setNavGuard(async function() {
        if (state.currentSessionId === null) return true;
        const confirmed = await showConfirmModal("Abandon current workout?", "Abandon");
        if (!confirmed) return false;
        await abandonSession();
        return true;
    });

    const cards = document.getElementById("exercise-cards");
    for (let i = 0; i < workout.exercises.length; i++) {
        const exercise = workout.exercises[i];
        const isUnilateral = exercise.unilateral === true;

        exercise.previousSets = await fetchLastSets(workout.id, exercise.id);
        if (isUnilateral) {
            exercise.previousLSets = exercise.previousSets.filter(s => s.side === "LEFT");
            exercise.previousRSets = exercise.previousSets.filter(s => s.side === "RIGHT");
        }

        const card = document.createElement("div");
        card.className = "exercise-card draggable-row";
        card.innerHTML = `
            <h3 class="exercise-card-title">${exercise.name}</h3>
            <div id="sets-${i}"></div>
        `;
        card.querySelector(".exercise-card-title").onclick = function() {
            showExerciseReadOnlyModal(exercise);
        };

        const addSetBtn = document.createElement("button");
        addSetBtn.textContent = "Add Set";
        addSetBtn.onclick = function() {
            const setsContainer = document.getElementById("sets-" + i);
            if (isUnilateral) {
                setsContainer.appendChild(createInputRow(workout, exercise, i, "LEFT"));
                setsContainer.appendChild(createInputRow(workout, exercise, i, "RIGHT"));
            } else {
                setsContainer.appendChild(createInputRow(workout, exercise, i, null));
            }
            updateHeaderVisibility(i);
            renumberSetRows(i, exercise);
        };

        card.appendChild(addSetBtn);
        card.appendChild(createNotesPanel(exercise));
        cards.appendChild(card);

        const setsContainer = document.getElementById("sets-" + i);
        if (isUnilateral) {
            const pairCount = Math.max(exercise.previousLSets.length, exercise.previousRSets.length);
            for (let k = 0; k < pairCount; k++) {
                setsContainer.appendChild(createInputRow(workout, exercise, i, "LEFT"));
                setsContainer.appendChild(createInputRow(workout, exercise, i, "RIGHT"));
            }
        } else {
            for (let k = 0; k < exercise.previousSets.length; k++) {
                setsContainer.appendChild(createInputRow(workout, exercise, i, null));
            }
        }
        updateHeaderVisibility(i);
        renumberSetRows(i, exercise);

        if (workout.exercises.length > 1) {
            attachLongPressDrag(card, {
                onReorder: function(from, to) {
                    const [moved] = workout.exercises.splice(from, 1);
                    workout.exercises.splice(to, 0, moved);
                    const cardEl = cards.children[from];
                    cards.removeChild(cardEl);
                    const refNode = cards.children[to] || null;
                    cards.insertBefore(cardEl, refNode);
                }
            });
        }
    }
}

export async function finishWorkout(workoutIndex) {
    const workout = state.workouts[workoutIndex];
    if (state.currentSessionId === null) {
        clearNavGuard();
        renderWorkouts();
        return;
    }
    const sessionId = state.currentSessionId;
    const sessionDate = state.currentSessionDate;
    state.currentSessionId = null;
    state.currentSessionDate = null;
    clearNavGuard();
    await finishSession(sessionId, workout.exercises.map(e => e.id));
    await renderWorkoutSummary(workout, sessionId, sessionDate, renderWorkouts);
}
