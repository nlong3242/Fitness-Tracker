import { CATEGORY_ORDER } from "../config.js";
import { escapeHtml, formatCategoryLabel, formatSessionDate } from "../utils/format.js";
import { attachLongPressDrag } from "../utils/dragDrop.js";
import { renderExerciseHistory } from "./exerciseHistory.js";

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
    // options.history: show a "View History" button; resolves { action: "history" }.
    const withHistory = options.history === true;
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
                ${withHistory ? `<button type="button" class="btn-secondary modal-history-btn" id="ex-edit-history">View History &#8250;</button>` : ""}
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

        const historyBtn = overlay.querySelector("#ex-edit-history");
        if (historyBtn) {
            historyBtn.onclick = async function() {
                if (isDirty() && !(await showConfirmModal("Discard unsaved changes?", "Discard"))) return;
                close({ action: "history" });
            };
        }

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

        // No autofocus: on iPhone it pops the keyboard over the details you
        // usually just came to read. Tap a field to edit it.
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
       - onSave(data):  async function receiving { date, workoutId, notes }
                        and returning the raw Response from the backend. The
                        modal disables the Save button during the call, then:
                          - 2xx  → close with { action: "save", schedule }
                          - 409  → show inline "already scheduled" + re-enable
                          - else → show inline generic error + re-enable

       Resolves to:
       - null                                — Cancel
       - { action: "create-new-workout" }    — user tapped + Create new workout
       - { action: "save", schedule: {...} } — saved (post-2xx, schedule parsed)
    */
    const tappedIso = options.iso;
    const workouts = options.workouts;
    const preselectWorkoutId = options.preselectWorkoutId || null;
    const onSave = options.onSave;

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

        saveBtn.onclick = async function() {
            if (selectedWorkoutId === null) return;
            saveBtn.disabled = true;
            const originalLabel = saveBtn.textContent;
            saveBtn.textContent = "Scheduling…";
            clearError();

            let resp;
            try {
                resp = await onSave({
                    date: tappedIso,
                    workoutId: selectedWorkoutId,
                    notes: notesInput.value.trim() || null
                });
            } catch (e) {
                showError("Couldn't reach the server. Please try again.");
                saveBtn.disabled = false;
                saveBtn.textContent = originalLabel;
                return;
            }

            if (resp.ok) {
                const schedule = await resp.json();
                close({ action: "save", schedule: schedule });
                return;
            }

            if (resp.status === 409) {
                showError("This workout is already scheduled for this day.");
            } else {
                showError("Couldn't save. Please try again.");
            }
            saveBtn.disabled = false;
            saveBtn.textContent = originalLabel;
        };
    });
}

export function showScheduleForWorkoutModal(options) {
    /* Mirror of showScheduleModal but inverted — workout is fixed (rendered
       as the subtitle) and the user picks the date. Used from the workout
       detail page's Schedule button.

       options:
       - workoutName:    fixed workout name shown as subtitle
       - todayIso:       date input's min — past dates are forbidden
       - onSave(data):   async function receiving { date, notes } and
                         returning the raw Response. 2xx → close with
                         { schedule }; 409 → inline conflict; else inline
                         generic error.

       Resolves to:
       - null               — Cancel
       - { schedule: {...} } — saved (parsed body from the 2xx response)
    */
    const workoutName = options.workoutName;
    const todayIso = options.todayIso;
    const onSave = options.onSave;

    return new Promise(function(resolve) {
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
            <div class="modal-form-box">
                <div class="modal-form-title">Schedule a workout</div>
                <div class="modal-form-subtitle">${escapeHtml(workoutName)}</div>

                <div class="modal-inline-error" id="sched-error" hidden></div>

                <div class="modal-field">
                    <label class="modal-field-label">Date <span class="required">*</span></label>
                    <input type="date" id="sched-date">
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

        const dateInput = overlay.querySelector("#sched-date");
        const notesInput = overlay.querySelector("#sched-notes");
        const saveBtn = overlay.querySelector("#sched-save");
        const errorEl = overlay.querySelector("#sched-error");

        dateInput.min = todayIso;

        function clearError() {
            errorEl.hidden = true;
            errorEl.textContent = "";
        }
        function showError(msg) {
            errorEl.textContent = msg;
            errorEl.hidden = false;
        }
        function updateSaveState() {
            saveBtn.disabled = !dateInput.value || dateInput.value < todayIso;
        }

        dateInput.oninput = function() {
            clearError();
            updateSaveState();
        };

        function close(result) {
            document.body.removeChild(overlay);
            resolve(result);
        }

        overlay.querySelector(".modal-cancel").onclick = function() { close(null); };

        saveBtn.onclick = async function() {
            if (saveBtn.disabled) return;
            saveBtn.disabled = true;
            const originalLabel = saveBtn.textContent;
            saveBtn.textContent = "Scheduling…";
            clearError();

            let resp;
            try {
                resp = await onSave({
                    date: dateInput.value,
                    notes: notesInput.value.trim() || null
                });
            } catch (e) {
                showError("Couldn't reach the server. Please try again.");
                saveBtn.disabled = false;
                saveBtn.textContent = originalLabel;
                return;
            }

            if (resp.ok) {
                const schedule = await resp.json();
                close({ schedule: schedule });
                return;
            }

            if (resp.status === 409) {
                showError("This workout is already scheduled for that date.");
            } else {
                showError("Couldn't save. Please try again.");
            }
            saveBtn.disabled = false;
            saveBtn.textContent = originalLabel;
        };
    });
}

export function showRescheduleModal(options) {
    /* options:
       - currentIso: the schedule's current date (shown as subtitle so the
         user can see what they're moving from)
       - todayIso:   becomes the date input's min — past dates are forbidden
       - onSave(newDate): async function returning the raw Response from the
                          backend PATCH. The modal disables the Save button
                          during the call, then:
                            - 2xx → close with { schedule } (parsed body)
                            - 409 → show inline conflict, re-enable
                            - else → generic inline error, re-enable

       Resolves to:
       - null               — Cancel
       - { schedule: {...} } — saved (post-2xx, schedule parsed from response)
    */
    const currentIso = options.currentIso;
    const todayIso = options.todayIso;
    const onSave = options.onSave;

    return new Promise(function(resolve) {
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
            <div class="modal-form-box">
                <div class="modal-form-title">Reschedule</div>
                <div class="modal-form-subtitle">Currently on ${escapeHtml(formatSessionDate(currentIso))}</div>

                <div class="modal-inline-error" id="resched-error" hidden></div>

                <div class="modal-field">
                    <label class="modal-field-label">New date <span class="required">*</span></label>
                    <input type="date" id="resched-date">
                </div>

                <div class="modal-actions">
                    <button class="modal-cancel">Cancel</button>
                    <button class="modal-add" id="resched-save" disabled>Reschedule</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const dateInput = overlay.querySelector("#resched-date");
        const saveBtn = overlay.querySelector("#resched-save");
        const errorEl = overlay.querySelector("#resched-error");

        dateInput.value = currentIso;
        dateInput.min = todayIso;

        function clearError() {
            errorEl.hidden = true;
            errorEl.textContent = "";
        }
        function showError(msg) {
            errorEl.textContent = msg;
            errorEl.hidden = false;
        }
        function updateSaveState() {
            saveBtn.disabled = !dateInput.value
                || dateInput.value === currentIso
                || dateInput.value < todayIso;
        }

        dateInput.oninput = function() {
            clearError();
            updateSaveState();
        };

        function close(result) {
            document.body.removeChild(overlay);
            resolve(result);
        }

        overlay.querySelector(".modal-cancel").onclick = function() { close(null); };

        saveBtn.onclick = async function() {
            if (saveBtn.disabled) return;
            const newDate = dateInput.value;
            saveBtn.disabled = true;
            const originalLabel = saveBtn.textContent;
            saveBtn.textContent = "Saving…";
            clearError();

            let resp;
            try {
                resp = await onSave(newDate);
            } catch (e) {
                showError("Couldn't reach the server. Please try again.");
                saveBtn.disabled = false;
                saveBtn.textContent = originalLabel;
                return;
            }

            if (resp.ok) {
                const schedule = await resp.json();
                close({ schedule: schedule });
                return;
            }

            if (resp.status === 409) {
                showError("This workout is already scheduled for that date.");
            } else {
                showError("Couldn't reschedule. Please try again.");
            }
            saveBtn.disabled = false;
            saveBtn.textContent = originalLabel;
        };
    });
}

/* Tapping an exercise in a live workout or a session summary: History
   (PRs + past sessions, the default) and Details tabs. The tab body
   scrolls on its own so Close stays in view. */
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
                <div class="modal-form-title">${escapeHtml(exercise.name)}</div>
                <div class="modal-tab-row" role="tablist">
                    <button type="button" class="filter-pill selected" data-tab="history" role="tab">History</button>
                    <button type="button" class="filter-pill" data-tab="details" role="tab">Details</button>
                </div>
                <div class="modal-tab-body" data-body="history"></div>
                <div class="modal-tab-body" data-body="details" hidden>${rowsHtml}</div>
                <div class="modal-actions">
                    <button class="modal-cancel">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        renderExerciseHistory(overlay.querySelector('[data-body="history"]'), exercise.id);
        for (const tab of overlay.querySelectorAll(".modal-tab-row .filter-pill")) {
            tab.onclick = function() {
                for (const t of overlay.querySelectorAll(".modal-tab-row .filter-pill")) {
                    t.classList.toggle("selected", t === tab);
                }
                for (const body of overlay.querySelectorAll(".modal-tab-body")) {
                    body.hidden = body.dataset.body !== tab.dataset.tab;
                }
            };
        }
        overlay.querySelector(".modal-cancel").onclick = function() {
            document.body.removeChild(overlay);
            resolve();
        };
    });
}





export function showWeighInModal(options) {
    /* Add a weigh-in for any past day, or edit/delete an existing one.
       options:
       - entry:    { date, weightKg } to edit; omit to add (date picker shown)
       - byDate:   Map of YYYY-MM-DD → weightKg already logged, so adding
                   onto a logged day warns that it replaces that weight
       - todayIso: latest pickable date (no future weigh-ins)
       - onSave(date, kg) / onDelete(date): async; throw on failure, which
                   shows an inline error and keeps the modal open
       Resolves to true when something was saved or deleted, null on Cancel. */
    const entry = options.entry || null;
    const byDate = options.byDate;
    const todayIso = options.todayIso;

    return new Promise(function(resolve) {
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
            <div class="modal-form-box">
                <div class="modal-form-title">${entry ? "Edit Weigh-in" : "Add Weigh-in"}</div>
                ${entry ? `<div class="modal-form-subtitle">${escapeHtml(formatSessionDate(entry.date))}</div>` : ""}

                <div class="modal-inline-error" id="weighin-error" hidden></div>

                ${entry ? "" : `
                <div class="modal-field">
                    <label class="modal-field-label">Date <span class="required">*</span></label>
                    <input type="date" id="weighin-date">
                    <div class="modal-field-note" id="weighin-replaces" hidden></div>
                </div>`}

                <div class="modal-field">
                    <label class="modal-field-label">Weight (kg) <span class="required">*</span></label>
                    <input type="text" inputmode="decimal" autocomplete="off" id="weighin-kg">
                </div>

                <div class="modal-actions">
                    <button class="modal-cancel">Cancel</button>
                    ${entry ? `<button class="modal-delete" id="weighin-delete">Delete</button>` : ""}
                    <button class="modal-add" id="weighin-save" disabled>Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const dateInput = overlay.querySelector("#weighin-date");
        const kgInput = overlay.querySelector("#weighin-kg");
        const saveBtn = overlay.querySelector("#weighin-save");
        const deleteBtn = overlay.querySelector("#weighin-delete");
        const errorEl = overlay.querySelector("#weighin-error");
        const replacesEl = overlay.querySelector("#weighin-replaces");

        if (entry) {
            kgInput.value = entry.weightKg.toFixed(1);
        } else {
            dateInput.max = todayIso;
            // Yesterday by default: today is usually logged from the home tile.
            const [y, m, d] = todayIso.split("-").map(Number);
            dateInput.value = new Date(y, m - 1, d - 1).toLocaleDateString("en-CA");
        }

        function chosenDate() { return entry ? entry.date : dateInput.value; }
        function chosenKg() { return Number(kgInput.value.trim().replace(",", ".")); }

        function update() {
            errorEl.hidden = true;
            const date = chosenDate();
            const kg = chosenKg();
            saveBtn.disabled = !date || date > todayIso
                || !kgInput.value.trim() || !Number.isFinite(kg) || kg <= 0;
            if (replacesEl) {
                const existing = byDate.get(date);
                replacesEl.hidden = existing === undefined;
                if (existing !== undefined) replacesEl.textContent = `Replaces the ${existing.toFixed(1)} kg already logged that day.`;
            }
        }
        kgInput.oninput = update;
        if (dateInput) dateInput.oninput = update;
        update();

        function close(result) {
            document.body.removeChild(overlay);
            resolve(result);
        }

        async function run(btn, busyLabel, action) {
            const label = btn.textContent;
            btn.disabled = true;
            btn.textContent = busyLabel;
            try {
                await action();
            } catch (e) {
                errorEl.textContent = "Couldn't save. Check your connection and try again.";
                errorEl.hidden = false;
                btn.disabled = false;
                btn.textContent = label;
                return;
            }
            close(true);
        }

        overlay.querySelector(".modal-cancel").onclick = function() { close(null); };

        saveBtn.onclick = function() {
            if (saveBtn.disabled) return;
            run(saveBtn, "Saving…", function() { return options.onSave(chosenDate(), chosenKg()); });
        };

        kgInput.onkeydown = function(e) {
            if (e.key === "Enter") saveBtn.onclick();
        };

        // Two taps: the first asks, the second deletes.
        if (deleteBtn) {
            deleteBtn.onclick = function() {
                if (deleteBtn.dataset.armed !== "yes") {
                    deleteBtn.dataset.armed = "yes";
                    deleteBtn.textContent = "Tap to confirm";
                    return;
                }
                run(deleteBtn, "Deleting…", function() { return options.onDelete(entry.date); });
            };
        }

    });
}
