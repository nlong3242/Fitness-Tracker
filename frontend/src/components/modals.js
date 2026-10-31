import { escapeHtml, formatSessionDate } from "../utils/format.js";
import { WEEKDAY_NAMES, weekdayIndex, firstRepeatDay, repeatLabel } from "../utils/repeat.js";
import { attachLongPressDrag } from "../utils/dragDrop.js";
import { renderExerciseHistory } from "./exerciseHistory.js";
import { exerciseOverviewHtml } from "./exerciseOverview.js";

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
       - currentRepeat:  the workout's repeating plan, if it has one; a new
                         one replaces it, and the sheet says so
       - onSave(data):   async function receiving { date, notes, repeat } and
                         returning the raw Response. repeat is null for one
                         day, else { weekdays | everyDays, endDate } with date
                         as its start. 2xx → close; 409 → inline conflict;
                         else inline generic error.

       Resolves to:
       - null                          — Cancel
       - { schedule: {...}, firstDay } — saved (parsed body from the 2xx
                                         response; firstDay is the day to show)
    */
    const workoutName = options.workoutName;
    const todayIso = options.todayIso;
    const currentRepeat = options.currentRepeat || null;
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
                    <label class="modal-field-label"><span id="sched-date-label">Date</span> <span class="required">*</span></label>
                    <input type="date" id="sched-date">
                </div>

                <div class="modal-field">
                    <label class="modal-field-label">Repeat</label>
                    <div class="modal-pill-row" id="sched-repeat">
                        <button type="button" class="modal-pill selected" data-repeat="never">Never</button>
                        <button type="button" class="modal-pill" data-repeat="weekly">Weekly</button>
                        <button type="button" class="modal-pill" data-repeat="every">Every N days</button>
                    </div>
                </div>

                <div class="modal-field" id="sched-weekly" hidden>
                    <label class="modal-field-label">On <span class="required">*</span></label>
                    <div class="weekday-toggles">
                        ${WEEKDAY_NAMES.map((name, i) => `<button type="button" class="modal-pill weekday-toggle" data-day="${i}" aria-label="${name}" aria-pressed="false">${name[0]}</button>`).join("")}
                    </div>
                </div>

                <div class="modal-field" id="sched-every" hidden>
                    <label class="modal-field-label" for="sched-every-days">Every <span class="required">*</span></label>
                    <div class="every-days-row">
                        <input type="text" inputmode="numeric" autocomplete="off" maxlength="3" id="sched-every-days">
                        <span>days</span>
                    </div>
                </div>

                <div class="modal-field" id="sched-end-field" hidden>
                    <label class="modal-field-label">Ends (optional)</label>
                    <input type="date" id="sched-end">
                    ${currentRepeat ? `<div class="modal-field-note">Repeats now: ${escapeHtml(repeatLabel(currentRepeat))}. This replaces it.</div>` : ""}
                </div>

                <div class="modal-field" id="sched-notes-field">
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
        const everyInput = overlay.querySelector("#sched-every-days");
        const endInput = overlay.querySelector("#sched-end");
        const dayToggles = Array.from(overlay.querySelectorAll(".weekday-toggle"));

        let repeatKind = "never";
        let weekdays = 0;
        let weekdaysChosen = false;

        dateInput.min = todayIso;
        endInput.min = todayIso;

        function clearError() {
            errorEl.hidden = true;
            errorEl.textContent = "";
        }
        function showError(msg) {
            errorEl.textContent = msg;
            errorEl.hidden = false;
        }
        function everyDays() {
            const n = Number(everyInput.value);
            return n >= 1 && n <= 365 ? n : null;
        }
        function updateSaveState() {
            saveBtn.disabled = !dateInput.value || dateInput.value < todayIso
                || (repeatKind === "weekly" && weekdays === 0)
                || (repeatKind === "every" && everyDays() === null);
        }
        function showWeekdays() {
            dayToggles.forEach(function(btn) {
                const on = (weekdays & (1 << Number(btn.dataset.day))) !== 0;
                btn.classList.toggle("selected", on);
                btn.setAttribute("aria-pressed", String(on));
            });
        }

        // The start date's weekday is ticked until the user picks days themselves.
        function followDate() {
            if (weekdaysChosen || !dateInput.value) return;
            weekdays = 1 << weekdayIndex(dateInput.value);
            showWeekdays();
        }

        dateInput.oninput = function() {
            followDate();
            clearError();
            updateSaveState();
        };
        endInput.oninput = clearError;
        everyInput.oninput = function() {
            everyInput.value = everyInput.value.replace(/\D/g, "");
            clearError();
            updateSaveState();
        };

        overlay.querySelector("#sched-repeat").onclick = function(e) {
            const pill = e.target.closest("[data-repeat]");
            if (!pill) return;
            repeatKind = pill.dataset.repeat;
            overlay.querySelectorAll("#sched-repeat .modal-pill").forEach(function(p) {
                p.classList.toggle("selected", p === pill);
            });
            const repeating = repeatKind !== "never";
            overlay.querySelector("#sched-weekly").hidden = repeatKind !== "weekly";
            overlay.querySelector("#sched-every").hidden = repeatKind !== "every";
            overlay.querySelector("#sched-end-field").hidden = !repeating;
            // A note belongs to one day, so a repeating plan has none.
            overlay.querySelector("#sched-notes-field").hidden = repeating;
            overlay.querySelector("#sched-date-label").textContent = repeating ? "Starts" : "Date";
            saveBtn.textContent = repeating ? "Set repeat" : "Schedule";
            clearError();
            updateSaveState();
        };
        dayToggles.forEach(function(btn) {
            btn.onclick = function() {
                weekdaysChosen = true;
                weekdays ^= 1 << Number(btn.dataset.day);
                showWeekdays();
                clearError();
                updateSaveState();
            };
        });

        function close(result) {
            document.body.removeChild(overlay);
            resolve(result);
        }

        overlay.querySelector(".modal-cancel").onclick = function() { close(null); };

        saveBtn.onclick = async function() {
            if (saveBtn.disabled) return;
            const repeat = repeatKind === "weekly" ? { weekdays: weekdays, endDate: endInput.value || null }
                : repeatKind === "every" ? { everyDays: everyDays(), endDate: endInput.value || null }
                : null;
            let firstDay = dateInput.value;
            if (repeat) {
                if (repeat.endDate && repeat.endDate < dateInput.value) {
                    showError("The end date can't be before the start.");
                    return;
                }
                firstDay = firstRepeatDay({ ...repeat, startDate: dateInput.value });
                if (firstDay === null) {
                    showError("None of those days fall before the end date.");
                    return;
                }
            }
            saveBtn.disabled = true;
            const originalLabel = saveBtn.textContent;
            saveBtn.textContent = repeat ? "Saving…" : "Scheduling…";
            clearError();

            let resp;
            try {
                resp = await onSave({
                    date: dateInput.value,
                    notes: repeat ? null : notesInput.value.trim() || null,
                    repeat: repeat
                });
            } catch (e) {
                showError("Couldn't reach the server. Please try again.");
                saveBtn.disabled = false;
                saveBtn.textContent = originalLabel;
                return;
            }

            if (resp.ok) {
                const schedule = await resp.json();
                close({ schedule: schedule, firstDay: firstDay });
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
   (PRs + past sessions, the default) and Overview (exerciseOverview.js)
   tabs. The tab body scrolls on its own so Close stays in view. */
export function showExerciseReadOnlyModal(exercise) {
    return new Promise(function(resolve) {
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
            <div class="modal-form-box">
                <div class="modal-form-title">${escapeHtml(exercise.name)}</div>
                <div class="modal-tab-row" role="tablist">
                    <button type="button" class="filter-pill selected" data-tab="history" role="tab">History</button>
                    <button type="button" class="filter-pill" data-tab="overview" role="tab">Overview</button>
                </div>
                <div class="modal-tab-body" data-body="history"></div>
                <div class="modal-tab-body" data-body="overview" hidden>${exerciseOverviewHtml(exercise)}</div>
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
