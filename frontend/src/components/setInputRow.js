import { state } from "../state.js";
import { createSet, updateSet, deleteSet } from "../api.js";
import { ensureCurrentSession, maybeCleanupOrphanSession, touchActivity } from "../session.js";
import { saveExerciseDrafts } from "../drafts.js";

/* savedSet (optional): an already-persisted set to show in the row, used
   when resuming an in-progress session. */
export function createInputRow(workout, exercise, exerciseIndex, side, savedSet) {
    const isUnilateral = exercise.unilateral === true;
    const row = document.createElement("div");
    row.className = "set-input-row";
    if (side) row.dataset.side = side;
    row._savedSet = null;
    row.innerHTML = `
        <div class="set-input-num"></div>
        <div class="set-input-cell">
            <input type="number" min="0" step="0.5" inputmode="decimal" class="set-input weight-input">
            <span class="set-input-delta weight-delta"></span>
        </div>
        <div class="set-input-cell">
            <input type="number" min="1" step="1" inputmode="numeric" class="set-input reps-input">
            <span class="set-input-delta reps-delta"></span>
        </div>
        <button class="set-input-retry" aria-label="Retry">&#8635;</button>
        <button class="set-input-cancel">&#10005;</button>
        <div class="set-input-error"></div>
    `;
    const weightInput = row.querySelector(".weight-input");
    const repsInput = row.querySelector(".reps-input");
    const weightDelta = row.querySelector(".weight-delta");
    const repsDelta = row.querySelector(".reps-delta");
    const cancelBtn = row.querySelector(".set-input-cancel");
    const retryBtn = row.querySelector(".set-input-retry");
    const errorEl = row.querySelector(".set-input-error");
    const numEl = row.querySelector(".set-input-num");

    /* The label is a "log last time" button only while there is something
       to fill: .complete (both fields have a value) turns it back into
       plain text. Whether a last-time hint exists (.has-hint) is set by
       renumberSetRows, which knows the row's position. */
    function refreshTapState() {
        numEl.classList.toggle("complete", weightInput.value !== "" && repsInput.value !== "");
    }
    let persisting = false;

    /* A failed save/delete must be obvious mid-set: the row turns red with
       a message and a retry button. retry is what the button re-runs. */
    function setFailed(message, retry) {
        row.classList.add("save-failed");
        errorEl.textContent = `${message} — tap ↻ to retry`;
        retryBtn.onclick = retry;
    }
    function clearFailed() {
        row.classList.remove("save-failed");
        errorEl.textContent = "";
        retryBtn.onclick = null;
    }
    row._setFailed = setFailed;
    row._clearFailed = clearFailed;

    if (savedSet) {
        weightInput.value = savedSet.weight;
        repsInput.value = savedSet.reps;
        row._savedSet = savedSet;
        row.classList.add("saved");
    }
    refreshTapState();

    function disableWheelScroll(input) {
        input.addEventListener("wheel", function() { this.blur(); });
    }
    disableWheelScroll(weightInput);
    disableWheelScroll(repsInput);

    function renderDeltaSpan(el, delta) {
        if (delta === 0) {
            el.textContent = "";
            el.classList.remove("pos", "neg");
            return;
        }
        const sign = delta > 0 ? "+" : "";
        el.textContent = `${sign}${delta}`;
        el.classList.toggle("pos", delta > 0);
        el.classList.toggle("neg", delta < 0);
    }

    function lookupPrev() {
        const container = document.getElementById("sets-" + exerciseIndex);
        const rows = Array.from(container.children).filter(c => !c.classList.contains("set-header-row"));
        if (isUnilateral) {
            const sameSide = rows.filter(r => r.dataset.side === side);
            const position = sameSide.indexOf(row) + 1;
            const prevList = side === "LEFT" ? exercise.previousLSets : exercise.previousRSets;
            return prevList[position - 1];
        } else {
            const position = rows.indexOf(row) + 1;
            return exercise.previousSets[position - 1];
        }
    }

    function updateDeltas() {
        const prev = lookupPrev();
        if (!prev) {
            weightDelta.textContent = "";
            repsDelta.textContent = "";
            weightDelta.classList.remove("pos", "neg");
            repsDelta.classList.remove("pos", "neg");
            return;
        }
        const w = parseFloat(weightInput.value);
        const r = parseInt(repsInput.value);
        if (isNaN(w)) {
            weightDelta.textContent = "";
            weightDelta.classList.remove("pos", "neg");
        } else {
            renderDeltaSpan(weightDelta, w - prev.weight);
        }
        if (isNaN(r)) {
            repsDelta.textContent = "";
            repsDelta.classList.remove("pos", "neg");
        } else {
            renderDeltaSpan(repsDelta, r - prev.reps);
        }
    }

    row._updateDeltas = updateDeltas;

    // Unsaved typed values survive a reload (drafts.js); re-snapshotted on
    // every change so saving or emptying a row drops its draft.
    function saveDraft() {
        const container = document.getElementById("sets-" + exerciseIndex);
        if (container) saveExerciseDrafts(workout.id, exercise.id, container);
    }

    // Restore a draft into this (unsaved) row; a complete one was a failed
    // save, so it is retried.
    row._applyDraft = function(w, r) {
        weightInput.value = w;
        repsInput.value = r;
        onInputChange();
        if (w !== "" && r !== "") persist();
    };

    function refreshSavedClass() {
        if (!row._savedSet) return;
        const w = parseFloat(weightInput.value);
        const r = Number(repsInput.value);
        const matches = w === row._savedSet.weight && r === row._savedSet.reps;
        row.classList.toggle("saved", matches);
    }

    function onInputChange() {
        updateDeltas();
        refreshSavedClass();
        refreshTapState();
        saveDraft();
    }

    weightInput.oninput = onInputChange;
    repsInput.oninput = onInputChange;

    /* A saved set exists only while both fields are filled: emptying either
       one deletes it (the remaining value stays on screen, unsaved), and
       filling both again saves a new set. Without this, persist ignored
       the incomplete row, so the set stayed logged and came back on reload. */
    async function persist() {
        if (persisting) return;
        if (row._savedSet && (weightInput.value === "" || repsInput.value === "")) {
            await unlogSavedSet();
            return;
        }
        const w = parseFloat(weightInput.value);
        const r = Number(repsInput.value);
        if (isNaN(w) || w < 0) return;
        if (!Number.isInteger(r) || r <= 0) return;
        if (row._savedSet && w === row._savedSet.weight && r === row._savedSet.reps) return;
        persisting = true;
        try {
            if (row._savedSet) {
                const updated = await updateSet(row._savedSet.id, { weight: w, reps: r });
                row._savedSet.weight = updated.weight;
                row._savedSet.reps = updated.reps;
                row.classList.add("saved");
            } else {
                await ensureCurrentSession(workout);
                const body = { weight: w, reps: r };
                if (side) body.side = side;
                row._savedSet = await createSet(state.currentSessionId, exercise.id, body);
                exercise.sets.push(row._savedSet);
                row.classList.add("saved");
            }
            clearFailed();
            saveDraft();
            touchActivity();
        } catch (e) {
            row.classList.remove("saved");
            setFailed("Not saved", persist);
        } finally {
            persisting = false;
        }
    }

    weightInput.onchange = persist;
    repsInput.onchange = persist;

    // Deletes the row's saved set but keeps the row and whatever it shows.
    async function unlogSavedSet() {
        const saved = row._savedSet;
        // Detach first so refilling the row right after creates a new set
        // instead of updating the one being deleted.
        row._savedSet = null;
        row.classList.remove("saved");
        try {
            await deleteSet(saved.id);
            touchActivity();
            const idx = exercise.sets.indexOf(saved);
            if (idx >= 0) exercise.sets.splice(idx, 1);
            clearFailed();
            await maybeCleanupOrphanSession(workout);
        } catch (e) {
            row._savedSet = saved;
            // persist re-decides on retry: still incomplete → delete again,
            // refilled meanwhile → update the set instead.
            setFailed("Not deleted", persist);
        }
        onInputChange();
    }

    /* Tap the "Set 01" label to log last time's values (the placeholder
       hints) in one go. Only empty fields are filled, so a stray tap never
       overwrites a logged value, and "new weight, same reps" is one tap. */
    numEl.onclick = function() {
        const prev = lookupPrev();
        if (!prev) return;
        let filled = false;
        if (weightInput.value === "") { weightInput.value = prev.weight; filled = true; }
        if (repsInput.value === "") { repsInput.value = prev.reps; filled = true; }
        if (!filled) return;
        onInputChange();
        persist();
    };

    async function deleteRowSet(r) {
        if (r._savedSet) {
            await deleteSet(r._savedSet.id);
            touchActivity();
            const idx = exercise.sets.indexOf(r._savedSet);
            if (idx >= 0) exercise.sets.splice(idx, 1);
        }
        r.remove();
    }

    async function afterRowsRemoved() {
        saveDraft();
        await maybeCleanupOrphanSession(workout);
        updateHeaderVisibility(exerciseIndex);
        renumberSetRows(exerciseIndex, exercise);
    }

    // Deletes one row; on failure the row stays, flagged, retrying just itself.
    async function deleteOrFlag(r) {
        try {
            await deleteRowSet(r);
            return true;
        } catch (e) {
            r._setFailed("Not deleted", async function() {
                if (await deleteOrFlag(r)) await afterRowsRemoved();
            });
            return false;
        }
    }

    cancelBtn.onclick = async function() {
        if (isUnilateral) {
            const container = document.getElementById("sets-" + exerciseIndex);
            const rows = Array.from(container.children).filter(c => !c.classList.contains("set-header-row"));
            const sameSide = rows.filter(r => r.dataset.side === side);
            const position = sameSide.indexOf(row) + 1;
            const otherSide = side === "LEFT" ? "RIGHT" : "LEFT";
            const otherSideRows = rows.filter(r => r.dataset.side === otherSide);
            const partnerRow = otherSideRows[position - 1] || null;
            await deleteOrFlag(row);
            if (partnerRow) await deleteOrFlag(partnerRow);
        } else {
            await deleteOrFlag(row);
        }
        await afterRowsRemoved();
    };

    return row;
}

export function updateHeaderVisibility(exerciseIndex) {
    const container = document.getElementById("sets-" + exerciseIndex);
    const existingHeader = container.querySelector(".set-header-row");
    const hasRows = Array.from(container.children).some(c => !c.classList.contains("set-header-row"));
    if (hasRows && !existingHeader) {
        container.insertBefore(createHeaderRow(), container.firstChild);
    } else if (!hasRows && existingHeader) {
        existingHeader.remove();
    }
}

function createHeaderRow() {
    const row = document.createElement("div");
    row.className = "set-header-row";
    row.innerHTML = `
        <div class="set-input-num"></div>
        <div class="set-header-cell">Weight</div>
        <div class="set-header-cell">Reps</div>
    `;
    return row;
}

export function renumberSetRows(exerciseIndex, exercise) {
    const container = document.getElementById("sets-" + exerciseIndex);
    const isUnilateral = exercise.unilateral === true;
    if (isUnilateral) {
        let leftCount = 0;
        let rightCount = 0;
        for (const child of container.children) {
            if (child.classList.contains("set-header-row")) continue;
            const side = child.dataset.side;
            let label, prev;
            if (side === "LEFT") {
                leftCount++;
                label = `Set L${leftCount}`;
                prev = exercise.previousLSets[leftCount - 1];
            } else {
                rightCount++;
                label = `Set R${rightCount}`;
                prev = exercise.previousRSets[rightCount - 1];
            }
            const numEl = child.querySelector(".set-num, .set-input-num");
            if (numEl) numEl.textContent = label;
            if (numEl) numEl.classList.toggle("has-hint", Boolean(prev));
            const weightInput = child.querySelector("input.weight-input");
            const repsInput = child.querySelector("input.reps-input");
            if (weightInput && repsInput) {
                weightInput.placeholder = prev ? prev.weight : "";
                repsInput.placeholder = prev ? prev.reps : "";
            }
            if (child._updateDeltas) child._updateDeltas();
        }
    } else {
        let position = 0;
        for (const child of container.children) {
            if (child.classList.contains("set-header-row")) continue;
            position++;
            const label = `Set ${String(position).padStart(2, "0")}`;
            const prev = exercise.previousSets[position - 1];
            const numEl = child.querySelector(".set-num, .set-input-num");
            if (numEl) numEl.textContent = label;
            if (numEl) numEl.classList.toggle("has-hint", Boolean(prev));
            const weightInput = child.querySelector("input.weight-input");
            const repsInput = child.querySelector("input.reps-input");
            if (weightInput && repsInput) {
                weightInput.placeholder = prev ? prev.weight : "";
                repsInput.placeholder = prev ? prev.reps : "";
            }
            if (child._updateDeltas) child._updateDeltas();
        }
    }
}
