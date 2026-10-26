import { CATEGORY_ORDER, EQUIPMENT, EXERCISE_TYPES, LOG_TYPES } from "../config.js";
import { clearNavGuard, getNavGuard, setNavGuard } from "../components/bottomNav.js";
import { showConfirmModal } from "../components/modals.js";
import {
    copyExercise,
    createExercise,
    deleteExercise,
    fetchExercise,
    updateExercise,
    updateWorkoutExercise
} from "../api.js";
import { escapeHtml, formatCategoryLabel } from "../utils/format.js";
import { setRoute } from "../router.js";
import { renderExercisePage } from "./exercisePage.js";

/* Edit an exercise: Edit on the exercise page, or the workout page's ⋮
   menu. A built-in exercise can't be changed, so this first offers a
   Custom copy (which takes over the user's workouts and history for it,
   see ExerciseService.copyBuiltIn) and edits that. */
export async function editExercise(exercise, opts) {
    let target = exercise;
    if (exercise.builtIn) {
        const ok = await showConfirmModal(
            "Built-in exercises can't be changed. Make a Custom copy you can edit? "
            + "Your workouts and history for it will move to the copy.",
            "Make a copy");
        if (!ok) return;
        try {
            target = await copyExercise(exercise.id);
        } catch (e) {
            await showConfirmModal("Couldn't make the copy. Check your connection and try again.", "OK");
            return;
        }
    }
    renderExerciseEditPage(target, opts);
}

/* Edit a Custom exercise, as a page of its own. Cancel and Save go back to
   opts.onDone() if given (the workout page, from its ⋮ menu), else to the
   exercise page. Delete goes back to where the exercise page was opened
   from; from a workout there's no Delete (the ⋮ menu has Remove). Leaving
   by a tab with unsaved changes asks first. opts: as renderExercisePage. */
export function renderExerciseEditPage(exercise, opts) {
    clearNavGuard();
    setRoute(opts.routeFor(exercise.id) + "/edit");
    const workout = opts.workout || null;

    const form = renderExerciseForm({
        title: "Edit Exercise",
        saveLabel: "Save",
        initial: exercise,
        musclesPlaceholder: "None",
        deleteLabel: workout ? null : "Delete exercise",
        confirmTypeChange: true
    });
    setNavGuard(form.confirmLeave);
    const done = opts.onDone || function(shown) { renderExercisePage(shown, opts); };

    form.onCancel = async function() {
        if (await form.confirmLeave()) done(exercise);
    };

    form.onSave = async function(data) {
        const response = workout
            ? await updateWorkoutExercise(workout.id, exercise.id, data)
            : await updateExercise(exercise.id, data);
        if (!response.ok) throw new Error(String(response.status));
        let saved;
        try {
            saved = await fetchExercise(exercise.id);
        } catch (err) {
            saved = { ...exercise, ...data };
        }
        done(saved);
    };

    form.onDelete = async function() {
        if (!(await showConfirmModal(`Delete "${exercise.name}" permanently?`, "Delete"))) return;
        await deleteExercise(exercise.id);
        clearNavGuard();
        opts.onBack();
    };
}

/* Create a Custom exercise, as a page of its own (Create Exercise on the
   Exercises tab and the exercise picker). It holds unsaved state, so it
   records no route (router.js). The page it was opened from may have a
   leave-guard of its own (e.g. a new workout's draft, under the picker):
   leaving by a tab asks for both, and Cancel / Create put it back.
   opts:
     category          - preselected category (ignored unless a real one)
     onCancel()        - back to where it was opened from
     onCreated(saved)  - after the exercise is saved */
export function renderExerciseCreatePage(opts) {
    const outerGuard = getNavGuard();
    const form = renderExerciseForm({
        title: "New Exercise",
        saveLabel: "Create",
        initial: { category: CATEGORY_ORDER.includes(opts.category) ? opts.category : null },
        musclesPlaceholder: "e.g. Chest, Triceps",
        alwaysSavable: true
    });
    setNavGuard(async function() {
        return await form.confirmLeave() && (!outerGuard || await outerGuard());
    });

    form.onCancel = async function() {
        if (!(await form.confirmLeave())) return;
        setNavGuard(outerGuard);
        opts.onCancel();
    };

    form.onSave = async function(data) {
        const created = await createExercise(data);
        setNavGuard(outerGuard);
        opts.onCreated(created);
    };
}

/* The exercise form page shared by Create and Edit. Draws the page and
   returns { confirmLeave, onCancel, onSave(data), onDelete } - the caller
   fills in the handlers. Save is off until the name and category are set
   and (unless alwaysSavable) something changed; onSave throwing shows an
   error and lets the user try again. */
function renderExerciseForm(cfg) {
    const original = {
        name: cfg.initial.name || "",
        category: cfg.initial.category || null,
        primaryMuscleGroups: cfg.initial.primaryMuscleGroups || "",
        exerciseType: cfg.initial.exerciseType || "",
        equipment: cfg.initial.equipment || "",
        cues: cfg.initial.cues || "",
        unilateral: cfg.initial.unilateral === true,
        // A change still waiting for the open workout to end shows as the
        // choice, with a note (ExerciseService.changeLogType).
        logType: cfg.initial.pendingLogType || cfg.initial.logType || "WEIGHT_REPS"
    };
    const loggedNow = cfg.initial.logType || "WEIGHT_REPS";

    // Equipment from before (or not in the list) stays a choice, so it's kept.
    const equipmentChoices = original.equipment && !EQUIPMENT.includes(original.equipment)
        ? [...EQUIPMENT, original.equipment] : EQUIPMENT;

    const container = document.getElementById("app-content");
    container.innerHTML = `
        <div class="page-actions exp-actions">
            <button class="btn-secondary" id="exe-cancel-btn">Cancel</button>
            <button id="exe-save-btn" disabled>${escapeHtml(cfg.saveLabel)}</button>
        </div>
        <h2 class="exh-page-title">${escapeHtml(cfg.title)}</h2>
        <form class="exh-page-panel exe-form" id="exe-form" novalidate>
            <div class="modal-field">
                <label class="modal-field-label" for="exe-name">Name <span class="required">*</span></label>
                <input type="text" id="exe-name" maxlength="120" placeholder="Enter exercise name">
            </div>
            <div class="modal-field">
                <span class="modal-field-label">Category <span class="required">*</span></span>
                <div class="modal-pill-row" id="exe-categories">
                    ${CATEGORY_ORDER.map(c => `<button type="button" class="modal-pill" data-category="${c}">${escapeHtml(formatCategoryLabel(c))}</button>`).join("")}
                </div>
            </div>
            <div class="modal-field" id="exe-logtype-field">
                <label class="modal-field-label" for="exe-logtype">Logged as</label>
                <span class="modal-select">
                    <select id="exe-logtype">
                        ${LOG_TYPES.map(t => `<option value="${t.value}">${escapeHtml(t.label)}</option>`).join("")}
                    </select>
                </span>
                <p class="exe-field-note" id="exe-logtype-note" hidden>Applies after your current workout</p>
            </div>
            <div class="modal-field">
                <label class="modal-field-label" for="exe-muscles">Primary Muscle Groups</label>
                <input type="text" id="exe-muscles" maxlength="255" placeholder="${escapeHtml(cfg.musclesPlaceholder)}">
            </div>
            <div class="modal-field">
                <span class="modal-field-label">Exercise Type</span>
                <div class="modal-pill-row">
                    ${EXERCISE_TYPES.map(t => `<button type="button" class="modal-pill" data-type="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join("")}
                </div>
            </div>
            <div class="modal-field">
                <label class="modal-field-label" for="exe-equipment">Equipment</label>
                <span class="modal-select">
                    <select id="exe-equipment">
                        <option value="">None</option>
                        ${equipmentChoices.map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join("")}
                    </select>
                </span>
            </div>
            <div class="modal-field">
                <label class="modal-field-label" for="exe-cues">Cues</label>
                <textarea id="exe-cues" maxlength="4000" placeholder="One step or reminder a line"></textarea>
            </div>
            <div class="modal-field">
                <span class="modal-field-label">Unilateral</span>
                <div class="modal-pill-row">
                    <button type="button" class="modal-pill" data-unilateral="yes">Yes</button>
                    <button type="button" class="modal-pill" data-unilateral="no">No</button>
                </div>
            </div>
            <p class="auth-error" id="exe-error" role="alert" hidden></p>
        </form>
        ${cfg.deleteLabel ? `<button class="btn-danger exe-delete-btn" id="exe-delete-btn">${escapeHtml(cfg.deleteLabel)}</button>` : ""}
    `;
    document.getElementById("app-scroll").scrollTo(0, 0);

    const nameInput = document.getElementById("exe-name");
    const musclesInput = document.getElementById("exe-muscles");
    const equipmentSelect = document.getElementById("exe-equipment");
    const logTypeSelect = document.getElementById("exe-logtype");
    const logTypeField = document.getElementById("exe-logtype-field");
    const logTypeNote = document.getElementById("exe-logtype-note");
    const cuesInput = document.getElementById("exe-cues");
    const saveBtn = document.getElementById("exe-save-btn");
    const errorEl = document.getElementById("exe-error");
    nameInput.value = original.name;
    musclesInput.value = original.primaryMuscleGroups;
    equipmentSelect.value = original.equipment;
    logTypeSelect.value = original.logType;
    cuesInput.value = original.cues;
    let category = original.category;
    let unilateral = original.unilateral;
    // A type from before the pills (typed in) shows no pill and is kept
    // until another is picked.
    let exerciseType = original.exerciseType;

    // Cardio is always Distance & time, whatever the drop-down says.
    function logType() {
        return category === "CARDIO" ? "DISTANCE_TIME" : logTypeSelect.value;
    }

    function current() {
        return {
            name: nameInput.value,
            category: category,
            primaryMuscleGroups: musclesInput.value,
            exerciseType: exerciseType,
            equipment: equipmentSelect.value,
            cues: cuesInput.value,
            unilateral: unilateral,
            logType: logType()
        };
    }
    function isDirty() {
        const cur = current();
        return Object.keys(original).some(k => cur[k] !== original[k]);
    }
    function refresh() {
        const complete = nameInput.value.trim() !== "" && category !== null;
        saveBtn.disabled = !(complete && (cfg.alwaysSavable || isDirty()));
        for (const b of container.querySelectorAll("[data-category]")) {
            b.classList.toggle("selected", b.dataset.category === category);
        }
        for (const b of container.querySelectorAll("[data-unilateral]")) {
            b.classList.toggle("selected", (b.dataset.unilateral === "yes") === unilateral);
        }
        for (const b of container.querySelectorAll("[data-type]")) {
            b.classList.toggle("selected", b.dataset.type === exerciseType);
        }
        logTypeField.hidden = category === "CARDIO";
        // Still waiting, or another change that will wait the same way.
        logTypeNote.hidden = !(cfg.initial.pendingLogType && logType() !== loggedNow);
    }
    // The cues box grows with the text (up to about half the screen, then
    // it scrolls; modals.css).
    function fitCues() {
        cuesInput.style.height = "auto";
        cuesInput.style.height = `${cuesInput.scrollHeight + 4}px`;
    }

    for (const b of container.querySelectorAll("[data-category]")) {
        b.onclick = function() { category = b.dataset.category; refresh(); };
    }
    for (const b of container.querySelectorAll("[data-unilateral]")) {
        b.onclick = function() { unilateral = b.dataset.unilateral === "yes"; refresh(); };
    }
    // Optional: tapping the picked type again clears it.
    for (const b of container.querySelectorAll("[data-type]")) {
        b.onclick = function() {
            exerciseType = exerciseType === b.dataset.type ? "" : b.dataset.type;
            refresh();
        };
    }
    nameInput.oninput = refresh;
    musclesInput.oninput = refresh;
    equipmentSelect.onchange = refresh;
    logTypeSelect.onchange = refresh;
    cuesInput.oninput = function() { fitCues(); refresh(); };
    refresh();
    requestAnimationFrame(fitCues);

    const form = {
        // Unsaved changes: ask before throwing them away.
        confirmLeave: async function() {
            return !isDirty() || await showConfirmModal("Discard unsaved changes?", "Discard");
        },
        onCancel: null,
        onSave: null,
        onDelete: null
    };

    document.getElementById("exe-cancel-btn").onclick = function() { form.onCancel(); };
    document.getElementById("exe-form").onsubmit = function(e) { e.preventDefault(); };

    saveBtn.onclick = async function() {
        const name = nameInput.value.trim();
        if (!name || !category) return;
        // Moving into or out of Cardio changes the type too.
        if (cfg.confirmTypeChange && logType() !== original.logType && !(await showConfirmModal(
                "Past sets stay in History, but this exercise starts fresh: no \"last time\" or bests from before.",
                "Change"))) return;
        saveBtn.disabled = true;
        errorEl.hidden = true;
        try {
            await form.onSave({
                name: name,
                category: category,
                primaryMuscleGroups: musclesInput.value.trim() || null,
                exerciseType: exerciseType.trim() || null,
                equipment: equipmentSelect.value || null,
                cues: cuesInput.value.trim() || null,
                unilateral: unilateral,
                logType: logType()
            });
        } catch (err) {
            errorEl.textContent = "Couldn't save. Check your connection and try again.";
            errorEl.hidden = false;
            refresh();
        }
    };

    const deleteBtn = document.getElementById("exe-delete-btn");
    if (deleteBtn) deleteBtn.onclick = function() { form.onDelete(); };

    return form;
}
