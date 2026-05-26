import { state } from "../state.js";
import {
    fetchWorkoutExercises,
    updateWorkoutExercise,
    removeWorkoutExercise,
    reorderWorkoutExercises,
    fetchSessionsPage
} from "../api.js";
import { attachLongPressDrag } from "../utils/dragDrop.js";
import { formatSessionDate } from "../utils/format.js";
import {
    showExerciseDetailsModal,
    showConfirmModal
} from "../components/modals.js";
import { renderWorkouts } from "./workouts.js";
import { addExercise } from "./exercisePicker.js";
import { startWorkout } from "./activeWorkout.js";
import { viewSessionSummary } from "./summary.js";

export async function viewWorkout(workoutIndex) {
    const workout = state.workouts[workoutIndex];
    workout.exercises = await fetchWorkoutExercises(workout.id);

    const container = document.getElementById("container");
    container.innerHTML = `
        <h2>${workout.name}</h2>
        <div class="page-actions">
            <button id="workout-add-exercise-btn">Add Exercise</button>
            <button id="workout-start-btn">Start Workout</button>
        </div>
        <ul id="exercise-list"></ul>
        <h3 class="library-group-heading">Previous Sessions</h3>
        <div id="session-list"></div>
        <button id="load-more-sessions" style="display:none">Load More</button>
        <div class="page-actions">
            <button class="btn-secondary" id="workout-back-btn">Back</button>
        </div>
    `;

    document.getElementById("workout-add-exercise-btn").onclick = function() { addExercise(workoutIndex); };
    document.getElementById("workout-start-btn").onclick = function() { startWorkout(workoutIndex); };
    document.getElementById("workout-back-btn").onclick = renderWorkouts;

    const list = document.getElementById("exercise-list");

    function rebuildExerciseList() {
        list.innerHTML = "";
        for (let i = 0; i < workout.exercises.length; i++) {
            const exercise = workout.exercises[i];
            const item = document.createElement("li");
            item.className = "exercise-row draggable-row";
            item.style.cursor = "pointer";
            item.appendChild(document.createTextNode(`${i + 1}. ${exercise.name}`));
            item.onclick = async function() {
                const result = await showExerciseDetailsModal(exercise, {
                    deleteLabel: "Remove",
                    deleteConfirmMessage: `Remove "${exercise.name}" from "${workout.name}"?`
                });
                if (!result) return;
                if (result.action === "save") {
                    await updateWorkoutExercise(workout.id, exercise.id, result.data);
                    viewWorkout(workoutIndex);
                } else if (result.action === "delete") {
                    await removeWorkoutExercise(workout.id, exercise.id);
                    viewWorkout(workoutIndex);
                }
            };
            list.appendChild(item);
            if (workout.exercises.length > 1) {
                attachLongPressDrag(item, {
                    onReorder: async function(from, to) {
                        const [moved] = workout.exercises.splice(from, 1);
                        workout.exercises.splice(to, 0, moved);
                        rebuildExerciseList();
                        const orderedExerciseIds = workout.exercises.map(e => e.id);
                        const resp = await reorderWorkoutExercises(workout.id, orderedExerciseIds);
                        if (!resp.ok) {
                            const [back] = workout.exercises.splice(to, 1);
                            workout.exercises.splice(from, 0, back);
                            rebuildExerciseList();
                            await showConfirmModal("Couldn't save the new order.", "OK");
                        }
                    }
                });
            }
        }
    }
    rebuildExerciseList();

    let nextPage = 0;
    let sessionIndex = 1;
    const loadMoreBtn = document.getElementById("load-more-sessions");
    const sessionList = document.getElementById("session-list");

    async function loadSessionPage() {
        const pageData = await fetchSessionsPage(workout.id, nextPage, 5);
        if (nextPage === 0 && pageData.content.length === 0) {
            sessionList.innerHTML = `<div class="empty-sessions">No previous sessions yet.</div>`;
            return;
        }
        for (const session of pageData.content) {
            const row = document.createElement("div");
            row.className = "session-row";
            row.innerHTML = `<span class="session-index">${sessionIndex}.</span> ${formatSessionDate(session.date)}`;
            row.onclick = function() {
                viewSessionSummary(workoutIndex, session.id, session.date);
            };
            sessionList.appendChild(row);
            sessionIndex++;
        }
        nextPage++;
        loadMoreBtn.style.display = pageData.last ? "none" : "inline-block";
    }

    loadMoreBtn.onclick = loadSessionPage;
    await loadSessionPage();
}
