import { state, clearCurrentSession } from "../state.js";
import { getStartedWorkoutId, clearStartedWorkout } from "../session.js";
import { clearDrafts } from "../drafts.js";
import {
    createWorkout,
    deleteWorkout,
    linkExerciseToWorkout
} from "../api.js";
import { attachLongPressDrag } from "../utils/dragDrop.js";
import { showConfirmModal } from "../components/modals.js";
import { setActiveTab, setNavGuard, clearNavGuard } from "../components/bottomNav.js";
import { viewWorkout } from "./workoutDetail.js";
import { renderMultiSelectExercisePicker } from "./exercisePicker.js";

export function renderWorkouts() {
    clearNavGuard();
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <h2>My Workouts</h2>
        <div class="page-actions">
            <button id="workouts-create-btn">Create Workout</button>
            <button class="btn-secondary" id="workouts-back-btn">Back</button>
        </div>
        <ul id="workout-list"></ul>
    `;

    document.getElementById("workouts-create-btn").onclick = function() { renderCreateWorkoutPage(); };
    document.getElementById("workouts-back-btn").onclick = function() { setActiveTab("home"); };

    const list = document.getElementById("workout-list");
    for (const workout of state.workouts) {
        const item = document.createElement("li");
        const nameText = document.createTextNode(workout.name);
        item.style.cursor = "pointer";
        item.onclick = function() { viewWorkout(workout.id); };

        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "Delete";
        deleteBtn.onclick = async function(event) {
            event.stopPropagation();
            const confirmed = await showConfirmModal(`Delete workout "${workout.name}"?`, "Delete");
            if (!confirmed) return;
            await deleteWorkout(workout.id);
            // Its sessions go with it, including one still in progress.
            if (state.currentWorkoutId === workout.id) clearCurrentSession();
            if (getStartedWorkoutId() === workout.id) clearStartedWorkout();
            if (getStartedWorkoutId() === null && state.currentSessionId === null) clearDrafts();
            state.workouts = state.workouts.filter(w => w.id !== workout.id);
            renderWorkouts();
        };

        item.appendChild(nameText);
        item.appendChild(deleteBtn);
        list.appendChild(item);
    }
}

/* options (optional):
   - onBack(): called instead of renderWorkouts() when Back is tapped (after
     the discard-confirm). Used by callers like the calendar schedule modal
     that want to route back to themselves instead of the workout list.
   - onCreated(newWorkout): called instead of viewWorkout(...) after a
     successful save. Receives the newly-persisted workout. The default
     behaviour (navigate into the workout detail) only fires when this is
     absent.
   options is forwarded through the exercise-picker round-trip so the
   callbacks survive if the user opens Add Exercise mid-flow. */
export function renderCreateWorkoutPage(initialState, options) {
    const draft = initialState || { name: "", pendingExercises: [] };
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <h2>Create Workout</h2>
        <div class="create-workout-form">
            <label for="new-workout-name">Workout Name</label>
            <input type="text" id="new-workout-name" placeholder="Enter workout name">
        </div>
        <h3>Exercises</h3>
        <button id="add-exercise-btn">Add Exercise</button>
        <ul id="pending-exercises-list"></ul>
        <div class="page-actions">
            <button id="save-workout-btn" disabled>Save Workout</button>
            <button class="btn-secondary" id="back-btn">Back</button>
        </div>
    `;

    const nameInput = document.getElementById("new-workout-name");
    const addExerciseBtn = document.getElementById("add-exercise-btn");
    const saveBtn = document.getElementById("save-workout-btn");
    const backBtn = document.getElementById("back-btn");
    const list = document.getElementById("pending-exercises-list");

    nameInput.value = draft.name;
    saveBtn.disabled = draft.name.trim() === "";

    function hasUnsavedChanges() {
        return draft.name.trim() !== "" || draft.pendingExercises.length > 0;
    }

    setNavGuard(async function() {
        if (!hasUnsavedChanges()) return true;
        return await showConfirmModal("Discard this workout?", "Discard");
    });

    function renderPendingList() {
        list.innerHTML = "";
        for (let i = 0; i < draft.pendingExercises.length; i++) {
            const exercise = draft.pendingExercises[i];
            const item = document.createElement("li");
            item.className = "draggable-row";
            item.appendChild(document.createTextNode(`${i + 1}. ${exercise.name}`));
            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "Remove";
            deleteBtn.onclick = function() {
                draft.pendingExercises.splice(i, 1);
                renderPendingList();
            };
            item.appendChild(deleteBtn);
            list.appendChild(item);
            if (draft.pendingExercises.length > 1) {
                attachLongPressDrag(item, {
                    onReorder: function(from, to) {
                        const [moved] = draft.pendingExercises.splice(from, 1);
                        draft.pendingExercises.splice(to, 0, moved);
                        renderPendingList();
                    }
                });
            }
        }
    }
    renderPendingList();

    addExerciseBtn.onclick = async function() {
        draft.name = nameInput.value;
        const workoutLabel = draft.name.trim() || "new workout";
        await renderMultiSelectExercisePicker({
            title: `Add to ${workoutLabel}`,
            workoutLabel: workoutLabel,
            excludedIds: draft.pendingExercises.map(e => e.id),
            onCancel: function() { renderCreateWorkoutPage(draft, options); },
            onConfirm: function(selected) {
                draft.pendingExercises.push(...selected);
                renderCreateWorkoutPage(draft, options);
            }
        });
    };

    nameInput.oninput = function() {
        draft.name = nameInput.value;
        saveBtn.disabled = nameInput.value.trim() === "";
    };

    saveBtn.onclick = async function() {
        const name = nameInput.value.trim();
        if (!name) return;
        saveBtn.disabled = true;
        const newWorkout = await createWorkout({ name: name });
        for (const exercise of draft.pendingExercises) {
            await linkExerciseToWorkout(newWorkout.id, exercise.id);
        }
        state.workouts.push(newWorkout);
        clearNavGuard();
        if (options && options.onCreated) {
            options.onCreated(newWorkout);
        } else {
            viewWorkout(newWorkout.id);
        }
    };

    backBtn.onclick = async function() {
        if (hasUnsavedChanges()) {
            const confirmed = await showConfirmModal("Discard this workout?", "Discard");
            if (!confirmed) return;
        }
        clearNavGuard();
        if (options && options.onBack) {
            options.onBack();
        } else {
            renderWorkouts();
        }
    };
}
