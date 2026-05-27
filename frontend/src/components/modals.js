import { CATEGORY_ORDER } from "../config.js";
import { escapeHtml, formatCategoryLabel, formatSessionDate } from "../utils/format.js";
import { attachLongPressDrag } from "../utils/dragDrop.js";

export function showConfirmModal(message, confirmLabel) {
    return new Promise(function(resolve) {
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
            <div class="modal-box">
                <div class="modal-message"></div>
                <div class="modal-actions">
                    <button class="modal-cancel">Cancel</button>
                    <button class="modal-confirm"></button>
                </div>
            </div>
        `;
        overlay.querySelector(".modal-message").textContent = message;
        overlay.querySelector(".modal-confirm").textContent = confirmLabel;
        document.body.appendChild(overlay);

        function close(result) {
            document.body.removeChild(overlay);
            resolve(result);
        }
        overlay.querySelector(".modal-cancel").onclick = function() { close(false); };
        overlay.querySelector(".modal-confirm").onclick = function() { close(true); };
    });
}

export function showExerciseFormModal(prefilledCategory) {
    return new Promise(function(resolve) {
        const initialCategory = CATEGORY_ORDER.includes(prefilledCategory) ? prefilledCategory : null;
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
            <div class="modal-form-box">
                <div class="modal-form-title">New Exercise</div>
                <div class="modal-field">
                    <label class="modal-field-label">Name <span class="required">*</span></label>
                    <input type="text" id="ex-form-name" placeholder="Enter exercise name">
                </div>
                <div class="modal-field">
                    <label class="modal-field-label">Category <span class="required">*</span></label>
                    <div class="modal-pill-row" id="ex-form-categories"></div>
                </div>
                <div class="modal-field">
                    <label class="modal-field-label">Primary Muscle Groups</label>
                    <input type="text" id="ex-form-muscles" placeholder="e.g. Pectoralis major, Triceps">
                </div>
                <div class="modal-field">
                    <label class="modal-field-label">Exercise Type</label>
                    <input type="text" id="ex-form-type" placeholder="e.g. Compound, Isolation">
                </div>
                <div class="modal-field">
                    <label class="modal-field-label">Cues</label>
                    <textarea id="ex-form-cues" placeholder="Form notes, technique reminders, etc."></textarea>
                </div>
                <div class="modal-field">
                    <label class="modal-field-label">Unilateral</label>
                    <div class="modal-pill-row">
                        <button type="button" class="modal-pill" data-unilateral="yes">Yes</button>
                        <button type="button" class="modal-pill selected" data-unilateral="no">No</button>
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="modal-cancel">Cancel</button>
                    <button class="modal-add" id="ex-form-add" disabled>Add Exercise</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const catRow = overlay.querySelector("#ex-form-categories");
        const nameInput = overlay.querySelector("#ex-form-name");
        const addBtn = overlay.querySelector("#ex-form-add");
        let selectedCategory = initialCategory;
        let unilateral = false;

        function updateAddState() {
            addBtn.disabled = nameInput.value.trim() === "" || selectedCategory === null;
        }

        for (const cat of CATEGORY_ORDER) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "modal-pill";
            btn.textContent = formatCategoryLabel(cat);
            if (cat === initialCategory) btn.classList.add("selected");
            btn.onclick = function() {
                selectedCategory = cat;
                catRow.querySelectorAll(".modal-pill").forEach(function(b) { b.classList.remove("selected"); });
                btn.classList.add("selected");
                updateAddState();
            };
            catRow.appendChild(btn);
        }

        const uniPills = overlay.querySelectorAll('[data-unilateral]');
        uniPills.forEach(function(btn) {
            btn.onclick = function() {
                unilateral = btn.dataset.unilateral === "yes";
                uniPills.forEach(function(b) { b.classList.remove("selected"); });
                btn.classList.add("selected");
            };
        });

        nameInput.oninput = updateAddState;

        function close(result) {
            document.body.removeChild(overlay);
            resolve(result);
        }

        overlay.querySelector(".modal-cancel").onclick = function() { close(null); };
        addBtn.onclick = function() {
            const name = nameInput.value.trim();
            if (!name || !selectedCategory) return;
            const muscles = overlay.querySelector("#ex-form-muscles").value.trim();
            const type = overlay.querySelector("#ex-form-type").value.trim();
            const cues = overlay.querySelector("#ex-form-cues").value.trim();
            close({
                name: name,
                category: selectedCategory,
                primaryMuscleGroups: muscles || null,
                exerciseType: type || null,
                cues: cues || null,
                unilateral: unilateral
            });
        };

        nameInput.focus();
    });
}

export function showExerciseDetailsModal(exercise, options) {
    options = options || {};
    const deleteLabel = options.deleteLabel || "Delete";
    const deleteConfirmMessage = options.deleteConfirmMessage || `Delete exercise "${exercise.name}"?`;
    return new Promise(function(resolve) {
        const original = {
            name: exercise.name || "",
            category: exercise.category || null,
            primaryMuscleGroups: exercise.primaryMuscleGroups || "",
            exerciseType: exercise.exerciseType || "",
            cues: exercise.cues || "",
            unilateral: exercise.unilateral === true
        };

        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
            <div class="modal-form-box">
                <div class="modal-form-title">Exercise Details</div>
                <div class="modal-field">
                    <label class="modal-field-label">Name <span class="required">*</span></label>
                    <input type="text" id="ex-edit-name" placeholder="Enter exercise name">
                </div>
                <div class="modal-field">
                    <label class="modal-field-label">Category <span class="required">*</span></label>
                    <div class="modal-pill-row" id="ex-edit-categories"></div>
                </div>
                <div class="modal-field">
                    <label class="modal-field-label">Primary Muscle Groups</label>
                    <input type="text" id="ex-edit-muscles" placeholder="None">
                </div>
                <div class="modal-field">
                    <label class="modal-field-label">Exercise Type</label>
                    <input type="text" id="ex-edit-type" placeholder="None">
                </div>
                <div class="modal-field">
                    <label class="modal-field-label">Cues</label>
                    <textarea id="ex-edit-cues" placeholder="None"></textarea>
                </div>
                <div class="modal-field">
                    <label class="modal-field-label">Unilateral</label>
                    <div class="modal-pill-row">
                        <button type="button" class="modal-pill" data-unilateral="yes">Yes</button>
                        <button type="button" class="modal-pill" data-unilateral="no">No</button>
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="modal-cancel">Cancel</button>
                    <button class="modal-delete" id="ex-edit-delete"></button>
                    <button class="modal-add" id="ex-edit-save" disabled>Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const nameInput = overlay.querySelector("#ex-edit-name");
        const musclesInput = overlay.querySelector("#ex-edit-muscles");
        const typeInput = overlay.querySelector("#ex-edit-type");
        const cuesInput = overlay.querySelector("#ex-edit-cues");
        const catRow = overlay.querySelector("#ex-edit-categories");
        const saveBtn = overlay.querySelector("#ex-edit-save");
        const deleteBtn = overlay.querySelector("#ex-edit-delete");
        deleteBtn.textContent = deleteLabel;
        const cancelBtn = overlay.querySelector(".modal-cancel");

        nameInput.value = original.name;
        musclesInput.value = original.primaryMuscleGroups;
        typeInput.value = original.exerciseType;
        cuesInput.value = original.cues;

        let selectedCategory = original.category;
        let unilateral = original.unilateral;

        function currentValues() {
            return {
                name: nameInput.value,
                category: selectedCategory,
                primaryMuscleGroups: musclesInput.value,
                exerciseType: typeInput.value,
                cues: cuesInput.value,
                unilateral: unilateral
            };
        }

        function isDirty() {
            const cur = currentValues();
            return cur.name !== original.name
                || cur.category !== original.category
                || cur.primaryMuscleGroups !== original.primaryMuscleGroups
                || cur.exerciseType !== original.exerciseType
                || cur.cues !== original.cues
                || cur.unilateral !== original.unilateral;
        }

        function updateSaveState() {
            saveBtn.disabled = !(isDirty() && nameInput.value.trim() !== "" && selectedCategory !== null);
        }

        for (const cat of CATEGORY_ORDER) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "modal-pill";
            btn.textContent = formatCategoryLabel(cat);
            if (cat === selectedCategory) btn.classList.add("selected");
            btn.onclick = function() {
                selectedCategory = cat;
                catRow.querySelectorAll(".modal-pill").forEach(function(b) { b.classList.remove("selected"); });
                btn.classList.add("selected");
                updateSaveState();
            };
            catRow.appendChild(btn);
        }

        const uniPills = overlay.querySelectorAll('[data-unilateral]');
        uniPills.forEach(function(btn) {
            const isYes = btn.dataset.unilateral === "yes";
            if (isYes === unilateral) btn.classList.add("selected");
            btn.onclick = function() {
                unilateral = isYes;
                uniPills.forEach(function(b) { b.classList.remove("selected"); });
                btn.classList.add("selected");
                updateSaveState();
            };
        });

        nameInput.oninput = updateSaveState;
        musclesInput.oninput = updateSaveState;
        typeInput.oninput = updateSaveState;
        cuesInput.oninput = updateSaveState;

        function close(result) {
            document.body.removeChild(overlay);
            resolve(result);
        }

        cancelBtn.onclick = async function() {
            if (!isDirty()) {
                close(null);
                return;
            }
            const requiredEmpty = nameInput.value.trim() === "" || selectedCategory === null;
            const message = requiredEmpty
                ? "Required field is empty. Discard changes?"
                : "Discard unsaved changes?";
            const confirmed = await showConfirmModal(message, "Discard");
            if (confirmed) close(null);
        };

        deleteBtn.onclick = async function() {
            const confirmed = await showConfirmModal(deleteConfirmMessage, deleteLabel);
            if (confirmed) close({ action: "delete" });
        };

        saveBtn.onclick = function() {
            const name = nameInput.value.trim();
            if (!name || !selectedCategory) return;
            const muscles = musclesInput.value.trim();
            const type = typeInput.value.trim();
            const cues = cuesInput.value.trim();
            close({
                action: "save",
                data: {
                    name: name,
                    category: selectedCategory,
                    primaryMuscleGroups: muscles || null,
                    exerciseType: type || null,
                    cues: cues || null,
                    unilateral: unilateral
                }
            });
        };

        nameInput.focus();
    });
}

export function showScheduleModal(options) {
    /* options:
       - iso:         the day the user tapped — fixed for the lifetime of the
                      modal (rendered as a subtitle under the title)
       - workouts:    [{ id, name }] — list of workout templates to pick from
       - preselectWorkoutId: optional id — if it matches a row, that row is
                             marked selected and the Save button enabled on
                             open. Used to bounce back from "+ Create new
                             workout" with the freshly-created template
                             already chosen.
       - conflictChecker: optional (date, workoutId) => boolean. Used in
                          mock mode to simulate the backend's 409 response.

       Resolves to:
       - null                                — Cancel
       - { action: "create-new-workout" }    — user tapped + Create new workout
       - { action: "save", data: {...} }     — { date, workoutId, notes? }
    */
    const tappedIso = options.iso;
    const workouts = options.workouts;
    const preselectWorkoutId = options.preselectWorkoutId || null;
    const conflictChecker = options.conflictChecker || null;

    return new Promise(function(resolve) {
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
            <div class="modal-form-box">
                <div class="modal-form-title">Schedule a workout</div>
                <div class="modal-form-subtitle">${escapeHtml(formatSessionDate(tappedIso))}</div>

                <div class="modal-inline-error" id="sched-error" hidden></div>

                <div class="modal-field">
                    <label class="modal-field-label">Workout <span class="required">*</span></label>
                    <div class="workout-picker-list" id="sched-workout-list"></div>
                </div>

                <div class="modal-field">
                    <label class="modal-field-label">Notes (optional)</label>
                    <textarea id="sched-notes" placeholder="Anything to remember for this day?"></textarea>
                </div>

                <div class="modal-actions">
                    <button class="modal-cancel">Cancel</button>
                    <button class="modal-add" id="sched-save" disabled>Schedule</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const listEl = overlay.querySelector("#sched-workout-list");
        const notesInput = overlay.querySelector("#sched-notes");
        const saveBtn = overlay.querySelector("#sched-save");
        const errorEl = overlay.querySelector("#sched-error");

        let selectedWorkoutId = null;

        function clearError() {
            errorEl.hidden = true;
            errorEl.textContent = "";
        }

        function showError(msg) {
            errorEl.textContent = msg;
            errorEl.hidden = false;
        }

        function updateSaveState() {
            saveBtn.disabled = selectedWorkoutId === null;
        }

        const createRow = document.createElement("div");
        createRow.className = "workout-picker-row create-row";
        createRow.textContent = "+ Create new workout";
        createRow.onclick = function() { close({ action: "create-new-workout" }); };
        listEl.appendChild(createRow);

        for (const w of workouts) {
            const row = document.createElement("div");
            row.className = "workout-picker-row";
            row.dataset.workoutId = w.id;
            row.textContent = w.name;
            row.onclick = function() {
                selectedWorkoutId = w.id;
                listEl.querySelectorAll(".workout-picker-row").forEach(function(r) {
                    r.classList.remove("selected");
                });
                row.classList.add("selected");
                clearError();
                updateSaveState();
            };
            if (w.id === preselectWorkoutId) {
                row.classList.add("selected");
                selectedWorkoutId = w.id;
            }
            listEl.appendChild(row);
        }

        updateSaveState();
        if (preselectWorkoutId !== null) {
            const preselectedRow = listEl.querySelector(`.workout-picker-row[data-workout-id="${preselectWorkoutId}"]`);
            if (preselectedRow) preselectedRow.scrollIntoView({ block: "nearest" });
        }

        function close(result) {
            document.body.removeChild(overlay);
            resolve(result);
        }

        overlay.querySelector(".modal-cancel").onclick = function() { close(null); };

        saveBtn.onclick = function() {
            if (selectedWorkoutId === null) return;
            if (conflictChecker && conflictChecker(tappedIso, selectedWorkoutId)) {
                showError("This workout is already scheduled for this day.");
                return;
            }
            close({
                action: "save",
                data: {
                    date: tappedIso,
                    workoutId: selectedWorkoutId,
                    notes: notesInput.value.trim() || null
                }
            });
        };
    });
}

export function showExerciseReadOnlyModal(exercise) {
    return new Promise(function(resolve) {
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        const rows = [
            ["Name", exercise.name],
            ["Category", formatCategoryLabel(exercise.category)],
            ["Primary Muscle Groups", exercise.primaryMuscleGroups],
            ["Exercise Type", exercise.exerciseType],
            ["Cues", exercise.cues],
            ["Unilateral", exercise.unilateral === true ? "Yes" : "No"]
        ];
        let rowsHtml = "";
        for (const [label, value] of rows) {
            const display = value === null || value === undefined || value === ""
                ? `<span class="modal-readonly-empty">None</span>`
                : escapeHtml(String(value));
            rowsHtml += `
                <div class="modal-readonly-row">
                    <div class="modal-readonly-label">${label}</div>
                    <div class="modal-readonly-value">${display}</div>
                </div>
            `;
        }
        overlay.innerHTML = `
            <div class="modal-form-box">
                <div class="modal-form-title">Exercise Details</div>
                ${rowsHtml}
                <div class="modal-actions">
                    <button class="modal-cancel">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector(".modal-cancel").onclick = function() {
            document.body.removeChild(overlay);
            resolve();
        };
    });
}




