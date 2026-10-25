import { findWorkout } from "../state.js";
import {
    fetchWorkoutExercises,
    reorderWorkoutExercises,
    createSchedule
} from "../api.js";
import { attachLongPressDrag } from "../utils/dragDrop.js";
import {
    showConfirmModal,
    showScheduleForWorkoutModal
} from "../components/modals.js";
import { clearNavGuard } from "../components/bottomNav.js";
import { renderWorkouts } from "./workouts.js";
import { addExercise } from "./exercisePicker.js";
import { startWorkout } from "./activeWorkout.js";
import { viewPastSessions } from "./pastSessions.js";
import { renderExercisePage } from "./exercisePage.js";
import { navigateToCalendarDay } from "./calendar.js";
import { escapeHtml } from "../utils/format.js";
import { setRoute } from "../router.js";

export async function viewWorkout(workoutId) {
    clearNavGuard();
    const workout = findWorkout(workoutId);
    workout.exercises = await fetchWorkoutExercises(workout.id);
    setRoute(`#/workouts/${workoutId}`);

    const container = document.getElementById("app-content");
    container.innerHTML = `
        <h2>${escapeHtml(workout.name)}</h2>
        <div class="page-actions">
            <button id="workout-add-exercise-btn">Add Exercise</button>
            <button id="workout-start-btn">Start Workout</button>
            <button id="workout-schedule-btn">Schedule</button>
        </div>
        <div class="page-actions">
            <button id="workout-past-sessions-btn">Past Sessions</button>
        </div>
        <ul id="exercise-list"></ul>
        <div id="exercise-list-empty" class="empty-sessions" hidden></div>
        <div class="page-actions">
            <button class="btn-secondary" id="workout-back-btn">Back</button>
        </div>
    `;

    document.getElementById("workout-add-exercise-btn").onclick = function() { addExercise(workoutId); };
    const startBtn = document.getElementById("workout-start-btn");
    if (workout.exercises.length === 0) {
        startBtn.disabled = true;
    } else {
        startBtn.onclick = function() { startWorkout(workoutId); };
    }
    document.getElementById("workout-schedule-btn").onclick = async function() {
        const todayIso = isoToday();
        const result = await showScheduleForWorkoutModal({
            workoutName: workout.name,
            todayIso: todayIso,
            onSave: function(data) {
                return createSchedule({
                    date: data.date,
                    workoutId: workout.id,
                    notes: data.notes
                });
            }
        });
        if (!result) return;
        await navigateToCalendarDay(result.schedule.date);
    };
    document.getElementById("workout-past-sessions-btn").onclick = function() { viewPastSessions(workoutId); };
    document.getElementById("workout-back-btn").onclick = renderWorkouts;

    const list = document.getElementById("exercise-list");

    function isoToday() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }

    const emptyState = document.getElementById("exercise-list-empty");

    function rebuildExerciseList() {
        list.innerHTML = "";
        if (workout.exercises.length === 0) {
            emptyState.textContent = `No exercises for "${workout.name}" yet.`;
            emptyState.hidden = false;
            return;
        }
        emptyState.hidden = true;
        for (let i = 0; i < workout.exercises.length; i++) {
            const exercise = workout.exercises[i];
            const item = document.createElement("li");
            item.className = "exercise-row draggable-row";
            item.style.cursor = "pointer";
            item.appendChild(document.createTextNode(`${i + 1}. ${exercise.name}`));
            item.onclick = function() {
                renderExercisePage(exercise, {
                    routeFor: id => `#/workouts/${workoutId}/exercises/${id}`,
                    onBack: function() { viewWorkout(workoutId); },
                    workout: { id: workout.id, name: workout.name }
                });
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
}
