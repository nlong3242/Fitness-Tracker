import { state } from "../state.js";
import { createSet, updateSet, deleteSet } from "../api.js";
import { ensureCurrentSession, maybeCleanupOrphanSession, touchActivity } from "../session.js";
import { saveExerciseDrafts } from "../drafts.js";

/* The boxes a set has, by how its exercise is logged (logType, config.js
   LOG_TYPES). "time" is one value in seconds typed into two boxes,
   min : sec. km is the only optional one. */
const COLUMNS = {
    WEIGHT_REPS: ["weight", "reps"],
    REPS: ["reps"],
    TIME: ["time"],
    DISTANCE_TIME: ["km", "time"]
};
const HEADERS = { weight: "Weight", reps: "Reps", km: "km" };

function columnsFor(exercise) {
    return COLUMNS[exercise.logType] || COLUMNS.WEIGHT_REPS;
}

/* The raw box values ("" when empty) of a set's numbers, as a row shows
   them: w, r, km, and the time as m and s. */
function boxValues(set) {
    const v = { w: String(set.weight), r: String(set.reps), km: "", m: "", s: "" };
    if (set.distanceKm != null) v.km = String(set.distanceKm);
    if (set.durationSeconds != null) {
        v.m = String(Math.floor(set.durationSeconds / 60));
        v.s = String(set.durationSeconds % 60).padStart(2, "0");
    }
    return v;
}

// 75 → "1:15"; with a sign for the last-time arrows.
function formatSeconds(total) {
    const abs = Math.abs(total);
    return `${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

/* A long distance can be wider than the km box: it depends on the digits
   (999.99 is wider than 160.25) and the phone's font, so the box is
   measured. Its text is smaller (.km-long) only while it doesn't fit. */
function fitKmText(box) {
    box.classList.remove("km-long");
    if (box.scrollWidth > box.clientWidth) box.classList.add("km-long");
}

// A hidden card's boxes have no width to measure, so each km box is
// measured again when its size changes, e.g. when its card is shown.
const kmBoxResizes = new ResizeObserver(function(entries) {
    for (const entry of entries) fitKmText(entry.target);
});

function cellHtml(col) {
    if (col === "time") {
        return `
        <div class="set-input-cell set-time-cell" data-col="time">
            <div class="set-time">
                <input type="text" inputmode="numeric" autocomplete="off" maxlength="3" class="set-input min-input" aria-label="Minutes">
                <span class="set-time-colon">:</span>
                <input type="text" inputmode="numeric" autocomplete="off" maxlength="2" class="set-input sec-input" aria-label="Seconds">
            </div>
            <span class="set-input-delta"></span>
        </div>`;
    }
    const input = {
        weight: `<input type="text" inputmode="decimal" autocomplete="off" maxlength="6" class="set-input weight-input">`,
        reps: `<input type="text" inputmode="numeric" autocomplete="off" maxlength="3" class="set-input reps-input">`,
        km: `<input type="text" inputmode="decimal" autocomplete="off" maxlength="6" class="set-input km-input">`
    }[col];
    return `
        <div class="set-input-cell" data-col="${col}">
            ${input}
            <span class="set-input-delta"></span>
        </div>`;
}

/* savedSet (optional): an already-persisted set to show in the row, used
   when resuming an in-progress session. */
export function createInputRow(workout, exercise, exerciseIndex, side, savedSet) {
    const isUnilateral = exercise.unilateral === true;
    const columns = columnsFor(exercise);
    const row = document.createElement("div");
    row.className = "set-input-row";
    if (side) row.dataset.side = side;
    row._savedSet = null;
    row._columns = columns;
    row.innerHTML = `
        <div class="set-input-num"></div>
        ${columns.map(cellHtml).join("")}
        <button class="set-input-retry" aria-label="Retry">&#8635;</button>
        <button class="set-input-cancel">&#10005;</button>
        <div class="set-input-error"></div>
    `;
    // The row's boxes by value key; those the type doesn't use are absent.
    const boxes = {
        w: row.querySelector(".weight-input"),
        r: row.querySelector(".reps-input"),
        km: row.querySelector(".km-input"),
        m: row.querySelector(".min-input"),
        s: row.querySelector(".sec-input")
    };
    for (const key of Object.keys(boxes)) if (!boxes[key]) delete boxes[key];
    const deltaFor = col => row.querySelector(`[data-col="${col}"] .set-input-delta`);
    const cancelBtn = row.querySelector(".set-input-cancel");
    const retryBtn = row.querySelector(".set-input-retry");
    const errorEl = row.querySelector(".set-input-error");
    const numEl = row.querySelector(".set-input-num");

    const val = key => boxes[key] ? boxes[key].value : "";
    // Whether a column has something typed in. A time needs more than 0:00
    // (either box may be blank), so 0:00 counts as no time, like blank boxes.
    function filled(col) {
        if (col === "weight") return val("w") !== "";
        if (col === "reps") return val("r") !== "";
        if (col === "km") return val("km") !== "";
        return Number(val("m") || 0) * 60 + Number(val("s") || 0) > 0;
    }
    // Every column the type needs (km is optional).
    function isComplete() {
        return columns.every(col => col === "km" || filled(col));
    }

    /* The row's numbers, as the API takes them: only the type's own, with
       NaN for one that isn't a valid number and null for a blank km. A
       blank min or sec counts as 0 (2 min, sec blank = 2:00). */
    function numbers() {
        const n = {};
        if (columns.includes("weight")) n.weight = val("w") === "" ? NaN : parseFloat(val("w"));
        if (columns.includes("reps")) n.reps = val("r") === "" ? NaN : Number(val("r"));
        if (columns.includes("km")) n.distanceKm = val("km") === "" ? null : parseFloat(val("km"));
        if (columns.includes("time")) n.durationSeconds = filled("time")
            ? Number(val("m") || 0) * 60 + Number(val("s") || 0) : NaN;
        return n;
    }
    function isValid(n) {
        if ("weight" in n && !(n.weight >= 0)) return false;
        if ("reps" in n && !(Number.isInteger(n.reps) && n.reps > 0)) return false;
        if ("durationSeconds" in n && !(n.durationSeconds > 0)) return false;
        if ("distanceKm" in n && n.distanceKm !== null && !(n.distanceKm > 0 && n.distanceKm <= 1000)) return false;
        return true;
    }
    function matchesSaved(n) {
        const saved = row._savedSet;
        return Object.keys(n).every(k => (saved[k] ?? null) === n[k]);
    }

    /* The label is a "log last time" button only while there is something
       to fill: .complete (every needed field has a value) turns it back into
       plain text. Whether a last-time hint exists (.has-hint) is set by
       renumberSetRows, which knows the row's position. */
    function refreshTapState() {
        numEl.classList.toggle("complete", isComplete());
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

    function fill(values, onlyEmpty) {
        for (const key of Object.keys(boxes)) {
            if (values[key] === undefined) continue;
            if (onlyEmpty && boxes[key].value !== "") continue;
            boxes[key].value = values[key];
        }
    }

    if (savedSet) {
        fill(boxValues(savedSet));
        row._savedSet = savedSet;
        row.classList.add("saved");
    }
    refreshTapState();

    for (const box of Object.values(boxes)) {
        box.addEventListener("wheel", function() { this.blur(); });
    }

    function renderDeltaSpan(el, delta, format) {
        if (delta === 0) {
            el.textContent = "";
            el.classList.remove("pos", "neg");
            return;
        }
        const sign = delta > 0 ? "+" : "-";
        el.textContent = `${sign}${format(Math.abs(delta))}`;
        el.classList.toggle("pos", delta > 0);
        el.classList.toggle("neg", delta < 0);
    }
    function clearDelta(el) {
        el.textContent = "";
        el.classList.remove("pos", "neg");
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

    // Last time's value per column; time compares the whole time (▲0:15).
    const COMPARE = {
        weight: [n => n.weight, p => p.weight, d => String(Math.round(d * 100) / 100)],
        reps: [n => n.reps, p => p.reps, String],
        km: [n => n.distanceKm, p => p.distanceKm, d => String(Math.round(d * 100) / 100)],
        time: [n => n.durationSeconds, p => p.durationSeconds, formatSeconds]
    };
    function updateDeltas() {
        const prev = lookupPrev();
        const n = numbers();
        for (const col of columns) {
            const el = deltaFor(col);
            const [now, then, format] = COMPARE[col];
            const a = now(n), b = prev ? then(prev) : null;
            if (b == null || a == null || Number.isNaN(a)) clearDelta(el);
            else renderDeltaSpan(el, Math.round((a - b) * 100) / 100, format);
        }
    }

    row._updateDeltas = updateDeltas;

    // Placeholders show last time's values (or nothing). Last time without
    // a distance hints "–" in km.
    let hint = {};
    row._setHint = function(prev) {
        hint = prev ? boxValues(prev) : {};
        if (prev && prev.distanceKm == null) hint.km = "–";
        for (const key of Object.keys(boxes)) boxes[key].placeholder = hint[key] ?? "";
        refreshKmBox();
    };

    /* The km box (set-input-row.css):
       - a logged set with no distance shows "–" (dark) rather than last
         time's distance, which would look logged; a "–" is centred (.km-dash)
       - a distance too wide for the box gets smaller text (fitKmText). */
    function refreshKmBox() {
        if (!boxes.km) return;
        boxes.km.placeholder = row._savedSet ? "–" : (hint.km ?? "");
        boxes.km.classList.toggle("km-dash", boxes.km.placeholder === "–");
        fitKmText(boxes.km);
    }
    if (boxes.km) kmBoxResizes.observe(boxes.km);

    // Unsaved typed values survive a reload (drafts.js); re-snapshotted on
    // every change so saving or emptying a row drops its draft.
    function saveDraft() {
        const container = document.getElementById("sets-" + exerciseIndex);
        if (container) saveExerciseDrafts(workout.id, exercise.id, container);
    }

    // What drafts.js keeps of this row: the typed boxes, or null if none.
    row._draftValues = function() {
        const d = {};
        for (const key of Object.keys(boxes)) if (boxes[key].value !== "") d[key] = boxes[key].value;
        return Object.keys(d).length ? d : null;
    };

    // Restore a draft into this (unsaved) row; a complete one was a failed
    // save, so it is retried.
    row._applyDraft = function(d) {
        fill(d);
        onInputChange();
        if (isComplete()) persist();
    };

    function refreshSavedClass() {
        if (!row._savedSet) return;
        row.classList.toggle("saved", matchesSaved(numbers()));
    }

    function onInputChange() {
        updateDeltas();
        refreshSavedClass();
        refreshKmBox();
        refreshTapState();
        saveDraft();
    }

    /* Plain text boxes (so tapping in puts the cursor at the end, see
       utils/caretAtEnd.js), kept to numbers: weight and km take one decimal
       point, and a comma counts as one (some iPhone regions type "72,5");
       the rest take digits only, and seconds stop at 59. */
    function keepNumber(input, decimal) {
        let v = input.value;
        if (decimal) {
            v = v.replace(/,/g, ".").replace(/[^\d.]/g, "");
            const dot = v.indexOf(".");
            if (dot >= 0) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "");
        } else {
            v = v.replace(/\D/g, "");
        }
        if (input === boxes.s && Number(v) > 59) v = v.slice(0, -1);
        if (v !== input.value) input.value = v;
    }

    for (const [key, box] of Object.entries(boxes)) {
        const decimal = key === "w" || key === "km";
        box.oninput = function() { keepNumber(box, decimal); onInputChange(); };
    }

    /* A saved set exists only while every needed field is filled: emptying
       one deletes it (the rest stays on screen, unsaved), and filling them
       again saves a new set. Without this, persist ignored the incomplete
       row, so the set stayed logged and came back on reload. */
    async function persist() {
        if (persisting) return;
        if (row._savedSet && !isComplete()) {
            await unlogSavedSet();
            return;
        }
        const n = numbers();
        if (!isComplete() || !isValid(n)) return;
        // A blank min or sec counts as 0; show it, so the row reads as the
        // time that's saved (3 : blank → 3 : 00).
        if (boxes.m && boxes.m.value === "") boxes.m.value = "0";
        if (boxes.s && boxes.s.value === "") boxes.s.value = "00";
        if (row._savedSet && matchesSaved(n)) return;
        persisting = true;
        try {
            if (row._savedSet) {
                const updated = await updateSet(row._savedSet.id, n);
                Object.assign(row._savedSet, {
                    weight: updated.weight,
                    reps: updated.reps,
                    durationSeconds: updated.durationSeconds,
                    distanceKm: updated.distanceKm
                });
                row.classList.add("saved");
            } else {
                await ensureCurrentSession(workout);
                const body = { ...n };
                if (side) body.side = side;
                row._savedSet = await createSet(state.currentSessionId, exercise.id, body);
                exercise.sets.push(row._savedSet);
                row.classList.add("saved");
            }
            clearFailed();
            refreshKmBox();
            saveDraft();
            touchActivity();
        } catch (e) {
            row.classList.remove("saved");
            setFailed("Not saved", persist);
        } finally {
            persisting = false;
        }
    }

    /* Saves when focus leaves the row, so min then sec (or km then time)
       save once, together, rather than box by box. */
    function persistOnLeave() {
        setTimeout(function() {
            if (!row.contains(document.activeElement)) persist();
        }, 0);
    }
    row.addEventListener("change", persistOnLeave);
    row.addEventListener("focusout", persistOnLeave);

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
       overwrites a logged value, and "new weight, same reps" is one tap.
       The time is one value: it's filled only if both its boxes are empty. */
    numEl.onclick = function() {
        const prev = lookupPrev();
        if (!prev) return;
        const before = JSON.stringify(row._draftValues());
        const hint = boxValues(prev);
        if (filled("time")) { delete hint.m; delete hint.s; }
        fill(hint, true);
        if (JSON.stringify(row._draftValues()) === before) return;
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
        const km = r.querySelector(".km-input");
        if (km) kmBoxResizes.unobserve(km);
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
    const firstRow = Array.from(container.children).find(c => !c.classList.contains("set-header-row"));
    if (firstRow && !existingHeader) {
        container.insertBefore(createHeaderRow(firstRow._columns), container.firstChild);
    } else if (!firstRow && existingHeader) {
        existingHeader.remove();
    }
}

// Headings over the boxes, laid out like a row so each sits over its own;
// the time has one over each of its boxes, min and sec.
function createHeaderRow(columns) {
    const row = document.createElement("div");
    row.className = "set-header-row";
    row.innerHTML = `
        <div class="set-input-num"></div>
        ${columns.map(col => col === "time" ? `
        <div class="set-header-cell set-time-cell">
            <div class="set-time">
                <span class="set-time-head">min</span>
                <span class="set-time-colon" aria-hidden="true">:</span>
                <span class="set-time-head">sec</span>
            </div>
        </div>` : `<div class="set-header-cell">${HEADERS[col]}</div>`).join("")}
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
            if (child._setHint) child._setHint(prev);
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
            if (child._setHint) child._setHint(prev);
            if (child._updateDeltas) child._updateDeltas();
        }
    }
}
