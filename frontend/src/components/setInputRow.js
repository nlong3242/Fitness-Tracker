import { state } from "../state.js";
import { createSet, updateSet, deleteSet } from "../api.js";
import { ensureCurrentSession, maybeCleanupOrphanSession } from "../session.js";

export function createInputRow(workout, exercise, exerciseIndex, side) {
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
        <button class="set-input-cancel">&#10005;</button>
    `;
    const weightInput = row.querySelector(".weight-input");
    const repsInput = row.querySelector(".reps-input");
    const weightDelta = row.querySelector(".weight-delta");
    const repsDelta = row.querySelector(".reps-delta");
    const cancelBtn = row.querySelector(".set-input-cancel");
    let persisting = false;

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
    }

    weightInput.oninput = onInputChange;
    repsInput.oninput = onInputChange;

    async function persist() {
        if (persisting) return;
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
        } finally {
            persisting = false;
        }
    }

    weightInput.onchange = persist;
    repsInput.onchange = persist;

    async function deleteRowSet(r) {
        if (r._savedSet) {
            await deleteSet(r._savedSet.id);
            const idx = exercise.sets.indexOf(r._savedSet);
            if (idx >= 0) exercise.sets.splice(idx, 1);
        }
        r.remove();
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
            await deleteRowSet(row);
            if (partnerRow) await deleteRowSet(partnerRow);
        } else {
            await deleteRowSet(row);
        }
        await maybeCleanupOrphanSession(workout);
        updateHeaderVisibility(exerciseIndex);
        renumberSetRows(exerciseIndex, exercise);
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
            const numEl = child.querySelector(".set-num, .set-input-num");
            if (numEl) numEl.textContent = label;
            const weightInput = child.querySelector("input.weight-input");
            const repsInput = child.querySelector("input.reps-input");
            if (weightInput && repsInput) {
                const prev = exercise.previousSets[position - 1];
                weightInput.placeholder = prev ? prev.weight : "";
                repsInput.placeholder = prev ? prev.reps : "";
            }
            if (child._updateDeltas) child._updateDeltas();
        }
    }
}
