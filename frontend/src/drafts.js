/* Set-row drafts: values typed into a row that isn't saved as a set (only
   one field filled, or a save that failed). Kept on the device so a reload
   doesn't wipe them. A row's draft disappears once it is saved or emptied.

   Shape: { workoutId, exercises: { [exerciseId]: { BOTH|LEFT|RIGHT: [values] } } }
   where values holds the typed boxes of a row: w, r, km, m, s (min and
   sec), only those with something typed, e.g. { w: "80" }
   (setInputRow.js _draftValues).
   Only one workout is ever in progress, so only one workout's drafts are
   kept. Drafts are positional per side but ignore saved rows: on resume
   they fill the first unsaved rows, after the saved sets (which is also
   how saved sets are laid out on resume). */

const KEY = "fitness.setDrafts";

function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; }
}

function write(value) {
    try {
        if (value) localStorage.setItem(KEY, JSON.stringify(value));
        else localStorage.removeItem(KEY);
    } catch (e) { /* storage unavailable: drafts just won't survive a reload */ }
}

export function sideKey(side) {
    return side || "BOTH";
}

// Re-reads every row of one exercise and stores its unsaved values.
export function saveExerciseDrafts(workoutId, exerciseId, setsContainer) {
    const lists = {};
    for (const row of setsContainer.querySelectorAll(".set-input-row")) {
        if (row._savedSet) continue;
        const values = row._draftValues();
        if (!values) continue;
        const key = sideKey(row.dataset.side);
        (lists[key] = lists[key] || []).push(values);
    }
    let all = read();
    if (!all || all.workoutId !== workoutId) all = { workoutId, exercises: {} };
    if (Object.keys(lists).length) all.exercises[exerciseId] = lists;
    else delete all.exercises[exerciseId];
    write(Object.keys(all.exercises).length ? all : null);
}

// { [exerciseId]: { side: [values] } } for this workout, or {}.
export function loadDrafts(workoutId) {
    const all = read();
    return all && all.workoutId === workoutId ? all.exercises : {};
}

// Drops one exercise's drafts (it was removed or replaced in the workout).
export function dropExerciseDrafts(workoutId, exerciseId) {
    const all = read();
    if (!all || all.workoutId !== workoutId || !all.exercises[exerciseId]) return;
    delete all.exercises[exerciseId];
    write(Object.keys(all.exercises).length ? all : null);
}

/* Today's exercises, once exercises were added, replaced or removed during
   the workout: { workoutId, ids, workoutIds }. ids is today's list in
   order; workoutIds is the workout's own list when the first change was
   made, so Finish can tell whether today differs from it. Absent while
   nothing changed: the workout's own list is used. Same lifetime as the
   drafts (clearDrafts drops both). */
const LIVE_KEY = "fitness.liveExercises";
let liveInMemory = null; // also kept here, in case storage is unavailable

export function loadLiveExercises(workoutId) {
    let live = liveInMemory;
    try {
        const stored = localStorage.getItem(LIVE_KEY);
        if (stored) live = JSON.parse(stored);
    } catch (e) { /* use the in-memory copy */ }
    return live && live.workoutId === workoutId ? live : null;
}

export function saveLiveExercises(workoutId, ids, workoutIds) {
    const existing = loadLiveExercises(workoutId);
    liveInMemory = { workoutId, ids, workoutIds: existing ? existing.workoutIds : workoutIds };
    try { localStorage.setItem(LIVE_KEY, JSON.stringify(liveInMemory)); } catch (e) { /* lasts until a reload */ }
}

// Ends the workout's device-side state: drafts and today's exercise list.
export function clearDrafts() {
    write(null);
    liveInMemory = null;
    try { localStorage.removeItem(LIVE_KEY); } catch (e) { /* ignore */ }
}
