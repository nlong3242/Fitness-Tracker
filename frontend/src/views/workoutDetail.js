import { findWorkout } from "../state.js";
import {
    fetchWorkoutExercises,
    reorderWorkoutExercises,
    removeWorkoutExercise,
    createSchedule
} from "../api.js";
import { attachLongPressDrag } from "../utils/dragDrop.js";
import {
    showConfirmModal,
    showScheduleForWorkoutModal
} from "../components/modals.js";
import { clearNavGuard } from "../components/bottomNav.js";
import { createMoreButton } from "../components/actionMenu.js";
import { renderWorkouts, workoutMenu } from "./workouts.js";
import { addExercise, replaceExercise } from "./exercisePicker.js";
import { startWorkout } from "./activeWorkout.js";
import { viewPastSessions } from "./pastSessions.js";
import { renderExercisePage } from "./exercisePage.js";
import { editExercise } from "./exerciseEdit.js";
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
        <div class="page-actions wd-top">
            <button class="btn-secondary" id="workout-back-btn">Back</button>
        </div>
        <h2 class="wd-title">${escapeHtml(workout.name)}</h2>
        <div class="page-actions">
            <button class="wd-start-btn" id="workout-start-btn">Start Workout</button>
        </div>
        <ul id="exercise-list"></ul>
        <div id="exercise-list-empty" class="empty-sessions" hidden></div>
        <div class="page-actions">
            <button class="btn-secondary wd-add-btn" id="workout-add-exercise-btn">+ Add Exercise</button>
        </div>
    `;

    document.getElementById("workout-add-exercise-btn").onclick = function() { addExercise(workoutId); };
    // The workout's other actions, the same ⋮ as on the workout list.
    container.querySelector(".wd-top").appendChild(createMoreButton(`Options for ${workout.name}`, function() {
        return workoutMenu(workout, {
            pastSessions: function() { viewPastSessions(workoutId); }
        });
    }));
    const startBtn = document.getElementById("workout-start-btn");
    startBtn.onclick = function() { startWorkout(workoutId); };
    document.getElementById("workout-back-btn").onclick = renderWorkouts;

    const list = document.getElementById("exercise-list");

    const exerciseOpts = {
        routeFor: id => `#/workouts/${workoutId}/exercises/${id}`,
        onBack: function() { viewWorkout(workoutId); },
        onDone: function() { viewWorkout(workoutId); },
        workout: { id: workout.id, name: workout.name }
    };

    // Each row's ⋮: changes to this workout's exercise. Tapping the row
    // itself just opens the exercise to look at.
    function rowMenu(exercise) {
        return [
            { label: "Replace exercise", onSelect: function() { replaceExercise(workoutId, exercise); } },
            { label: "Edit exercise", onSelect: function() { editExercise(exercise, exerciseOpts); } },
            { label: "Remove from workout", danger: true, onSelect: function() { removeFromWorkout(exercise); } }
        ];
    }

    // Off this workout only; the exercise stays in the library.
    async function removeFromWorkout(exercise) {
        if (!(await showConfirmModal(`Remove "${exercise.name}" from "${workout.name}"?`, "Remove"))) return;
        const resp = await removeWorkoutExercise(workout.id, exercise.id);
        if (!resp.ok) {
            await showConfirmModal("Couldn't remove the exercise.", "OK");
            return;
        }
        workout.exercises = workout.exercises.filter(e => e.id !== exercise.id);
        rebuildExerciseList();
    }

    const emptyState = document.getElementById("exercise-list-empty");

    function rebuildExerciseList() {
        list.innerHTML = "";
        startBtn.disabled = workout.exercises.length === 0;
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
            item.appendChild(createMoreButton(`Options for ${exercise.name}`, function() { return rowMenu(exercise); }));
            item.onclick = function() { renderExercisePage(exercise, exerciseOpts); };
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

/* Schedule (the workout's ⋮, here and on the workout list): pick a date, then that
   day opens in the calendar. */
export async function scheduleWorkout(workout) {
    const result = await showScheduleForWorkoutModal({
        workoutName: workout.name,
        todayIso: isoToday(),
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
}

function isoToday() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
