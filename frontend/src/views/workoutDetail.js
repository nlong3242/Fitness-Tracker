import { findWorkout } from "../state.js";
import {
    fetchWorkoutExercises,
    reorderWorkoutExercises,
    removeWorkoutExercise,
    createSchedule,
    fetchRepeat,
    saveRepeat,
    stopRepeat
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
import { repeatLabel, repeatDates } from "../utils/repeat.js";
import { setRoute } from "../router.js";

export async function viewWorkout(workoutId) {
    clearNavGuard();
    const workout = findWorkout(workoutId);
    workout.exercises = await fetchWorkoutExercises(workout.id);
    setRoute(`#/workouts/${workoutId}`);

    const container = document.getElementById("app-content");
    container.innerHTML = `
        <div class="page-actions page-top">
            <button class="btn-secondary" id="workout-back-btn">Back</button>
        </div>
        <h2 class="page-title">${escapeHtml(workout.name)}</h2>
        <div class="wd-repeat" id="workout-repeat" hidden></div>
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
    let repeatItems = [];
    showRepeatLine(workout, function(items) { repeatItems = items; });
    // The workout's other actions, the same ⋮ as on the workout list.
    container.querySelector(".page-top").appendChild(createMoreButton(`Options for ${workout.name}`, function() {
        return workoutMenu(workout, {
            pastSessions: function() { viewPastSessions(workoutId); },
            repeatItems: repeatItems
        });
    }));
    const startBtn = document.getElementById("workout-start-btn");
    startBtn.onclick = function() { startWorkout(workoutId, { button: startBtn }); };
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

/* "↻ Repeats Mon, Thu" when the workout has a repeating plan, with Edit and Stop
   handed to setMenuItems for the page's ⋮. It fills in after the page, which
   doesn't wait for it; if it can't be read the line and items just stay
   away. Skipping or moving one day is on the calendar. */
async function showRepeatLine(workout, setMenuItems) {
    const today = isoToday();
    const rule = await fetchRepeat(workout.id, today).catch(() => null);
    const line = document.getElementById("workout-repeat");
    if (line === null) return; // left the page meanwhile
    line.hidden = rule === null;
    setMenuItems(rule === null ? [] : [
        { label: "Edit repeat", onSelect: editRepeat },
        { label: "Stop repeat", danger: true, onSelect: stopIt }
    ]);
    if (rule === null) return;

    const label = repeatLabel(rule).replace(/^Every/, "every");
    const dates = repeatDates(rule, today);
    line.innerHTML = `<span class="wd-repeat-mark" aria-hidden="true">&#8635;</span> Repeats ${escapeHtml(label)}${dates ? ` <span class="wd-repeat-dates">${escapeHtml(dates)}</span>` : ""}`;

    async function editRepeat() {
        const result = await showScheduleForWorkoutModal({
            workoutName: workout.name,
            todayIso: today,
            editRepeat: rule,
            onSave: function(data) {
                return saveRepeat(workout.id, { ...data.repeat, startDate: data.date }, today);
            }
        });
        if (result) showRepeatLine(workout, setMenuItems);
    }

    async function stopIt() {
        const confirmed = await showConfirmModal(
            `Stop repeating "${workout.name}"? Nothing is planned from today on. Days you've already saved stay on the calendar.`,
            "Stop"
        );
        if (!confirmed) return;
        let stopped = false;
        try {
            stopped = (await stopRepeat(workout.id, today)).ok;
        } catch (e) { /* says so below */ }
        if (!stopped) {
            await showConfirmModal("Couldn't stop repeating. Check your connection and try again.", "OK");
            return;
        }
        showRepeatLine(workout, setMenuItems);
    }
}

/* Schedule (the workout's ⋮, here and on the workout list): pick a date, or a
   repeating plan, then that day (a repeat's first) opens in the calendar. */
export async function scheduleWorkout(workout) {
    const today = isoToday();
    // Only for a note on the sheet, so it's not worth stopping for.
    const currentRepeat = await fetchRepeat(workout.id, today).catch(() => null);
    const result = await showScheduleForWorkoutModal({
        workoutName: workout.name,
        todayIso: today,
        currentRepeat: currentRepeat,
        onSave: function(data) {
            if (data.repeat) {
                return saveRepeat(workout.id, { ...data.repeat, startDate: data.date }, today);
            }
            return createSchedule({
                date: data.date,
                workoutId: workout.id,
                notes: data.notes
            });
        }
    });
    if (!result) return;
    await navigateToCalendarDay(result.firstDay);
}

function isoToday() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
