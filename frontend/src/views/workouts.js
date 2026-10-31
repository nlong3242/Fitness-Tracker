import { state, clearCurrentSession } from "../state.js";
import { getStartedWorkoutId, clearStartedWorkout } from "../session.js";
import { clearDrafts } from "../drafts.js";
import {
    createWorkout,
    deleteWorkout,
    fetchWorkouts,
    linkExerciseToWorkout
} from "../api.js";
import { attachLongPressDrag } from "../utils/dragDrop.js";
import { showConfirmModal } from "../components/modals.js";
import { createMoreButton } from "../components/actionMenu.js";
import { liveWorkout } from "../components/liveWorkout.js";
import { setActiveTab, setNavGuard, clearNavGuard } from "../components/bottomNav.js";
import { viewWorkout, scheduleWorkout } from "./workoutDetail.js";
import { renderMultiSelectExercisePicker, addExercise } from "./exercisePicker.js";
import { viewPastSessions } from "./pastSessions.js";
import { startWorkout } from "./activeWorkout.js";
import { escapeHtml } from "../utils/format.js";
import { setRoute } from "../router.js";

export function renderWorkouts() {
    clearNavGuard();
    setRoute("#/workouts");
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <div class="page-actions page-top">
            <button class="btn-secondary" id="workouts-back-btn">Back</button>
        </div>
        <h2 class="page-title">My Workouts</h2>
        <div class="page-actions">
            <button id="workouts-create-btn">Create Workout</button>
        </div>
        <ul id="workout-list"></ul>
    `;

    document.getElementById("workouts-create-btn").onclick = function() { renderCreateWorkoutPage(); };
    document.getElementById("workouts-back-btn").onclick = function() { setActiveTab("home"); };

    const list = document.getElementById("workout-list");
    drawWorkoutRows(list);
    // state.workouts is loaded at startup, so exercise counts can be stale
    // (exercises added or removed since). Draw now, then again once fresh.
    fetchWorkouts().then(function(fresh) {
        state.workouts = fresh;
        if (list.isConnected) drawWorkoutRows(list);
    }).catch(function() { /* keep the cached list */ });
}

/* Each row: name and exercise count; Start (Resume for the workout that's
   open) right there, so a known workout starts in one tap; a ⋮ with the
   workout page's other actions and Delete. Tapping the row opens the
   workout. An empty workout can't be
   started. */
function drawWorkoutRows(list) {
    list.innerHTML = "";
    const live = liveWorkout();
    for (const workout of state.workouts) {
        const item = document.createElement("li");
        item.className = "workout-row";
        item.style.cursor = "pointer";
        item.onclick = function() { viewWorkout(workout.id); };

        const count = workout.exerciseCount || 0;
        const text = document.createElement("div");
        text.className = "workout-row-text";
        text.innerHTML = `<span class="workout-row-name">${escapeHtml(workout.name)}</span>`
            + `<span class="workout-row-count">${count === 0 ? "No exercises" : count === 1 ? "1 exercise" : `${count} exercises`}</span>`;
        item.appendChild(text);

        const isLive = live !== null && live.id === workout.id;
        if (count > 0 || isLive) {
            const startBtn = document.createElement("button");
            startBtn.type = "button";
            startBtn.className = "workout-row-start" + (isLive ? " live" : "");
            startBtn.innerHTML = isLive ? "Resume"
                : `<svg viewBox="0 0 4 7" aria-hidden="true" fill="currentColor"><path d="M0 0h1v1h1v1h1v1h1v1h-1v1h-1v1h-1v1h-1z"/></svg>Start`;
            startBtn.setAttribute("aria-label", `${isLive ? "Resume" : "Start"} ${workout.name}`);
            startBtn.onclick = function(e) {
                e.stopPropagation();
                startWorkout(workout.id, { button: startBtn });
            };
            item.appendChild(startBtn);
        }

        item.appendChild(createMoreButton(`Options for ${workout.name}`, function() {
            return workoutMenu(workout, {
                addExercise: function() { addExercise(workout.id, renderWorkouts); },
                pastSessions: function() { viewPastSessions(workout.id, renderWorkouts); }
            });
        }));
        list.appendChild(item);
    }
}

/* A workout's ⋮ (on the list and on its own page). Add exercise and Past
   sessions come back to wherever it was opened from, so the caller passes
   those; no addExercise means no Add exercise item (the workout's page
   has its own button). Delete always ends on the list. */
export function workoutMenu(workout, actions) {
    return [
        ...(actions.addExercise ? [{ label: "Add exercise", onSelect: actions.addExercise }] : []),
        { label: "Past sessions", onSelect: actions.pastSessions },
        { label: "Schedule", onSelect: function() { scheduleWorkout(workout); } },
        { label: "Delete workout", danger: true, onSelect: function() { removeWorkout(workout); } }
    ];
}

async function removeWorkout(workout) {
    const confirmed = await showConfirmModal(`Delete workout "${workout.name}"?`, "Delete");
    if (!confirmed) return;
    await deleteWorkout(workout.id);
    // Its sessions go with it, including one still in progress.
    if (state.currentWorkoutId === workout.id) clearCurrentSession();
    if (getStartedWorkoutId() === workout.id) clearStartedWorkout();
    if (getStartedWorkoutId() === null && state.currentSessionId === null) clearDrafts();
    state.workouts = state.workouts.filter(w => w.id !== workout.id);
    renderWorkouts();
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
        <div class="page-actions page-top">
            <button class="btn-secondary" id="back-btn">Back</button>
        </div>
        <h2 class="page-title">Create Workout</h2>
        <div class="create-workout-form">
            <label for="new-workout-name">Workout Name</label>
            <input type="text" id="new-workout-name" placeholder="Enter workout name">
        </div>
        <h3>Exercises</h3>
        <ul id="pending-exercises-list"></ul>
        <div id="pending-exercises-empty" class="empty-sessions" hidden>No exercises yet.</div>
        <div class="page-actions">
            <button class="btn-secondary cw-wide-btn" id="add-exercise-btn">+ Add Exercise</button>
        </div>
        <div class="page-actions">
            <button class="cw-wide-btn cw-save-btn" id="save-workout-btn" disabled>Save Workout</button>
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

    // Same look as the workout page: numbered rows with a ⋮ (Remove), long
    // press to reorder. Nothing is saved until Save Workout, so Remove
    // doesn't ask.
    function renderPendingList() {
        list.innerHTML = "";
        document.getElementById("pending-exercises-empty").hidden = draft.pendingExercises.length > 0;
        for (let i = 0; i < draft.pendingExercises.length; i++) {
            const exercise = draft.pendingExercises[i];
            const item = document.createElement("li");
            item.className = "draggable-row";
            item.appendChild(document.createTextNode(`${i + 1}. ${exercise.name}`));
            item.appendChild(createMoreButton(`Options for ${exercise.name}`, function() {
                return [{ label: "Remove exercise", danger: true, onSelect: function() {
                    draft.pendingExercises.splice(i, 1);
                    renderPendingList();
                } }];
            }));
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
