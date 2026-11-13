import { state, findWorkout, clearCurrentSession } from "../state.js";
import {
    fetchWorkoutExercises,
    fetchLastSets,
    fetchSessionSets,
    finishSession,
    updateSchedule,
    fetchSchedulesByDate,
    createSchedule,
    saveRepeatDay,
    setWorkoutExerciseList,
    fetchExercise,
    deleteSet,
    ApiError
} from "../api.js";
import {
    showExerciseReadOnlyModal,
    showConfirmModal,
    showChoiceModal
} from "../components/modals.js";
import { createNotesPanel } from "../components/notesPanel.js";
import { createMoreButton } from "../components/actionMenu.js";
import {
    createInputRow,
    updateHeaderVisibility,
    renumberSetRows
} from "../components/setInputRow.js";
import { attachLongPressDrag } from "../utils/dragDrop.js";
import { clearNavGuard, setNavVisible, highlightTab } from "../components/bottomNav.js";
import {
    abandonSession, markWorkoutStarted, clearStartedWorkout, getStartedWorkoutId,
    touchActivity, maybeCleanupOrphanSession
} from "../session.js";
import {
    loadDrafts, clearDrafts, sideKey, dropExerciseDrafts, loadLiveExercises, saveLiveExercises
} from "../drafts.js";
import { renderMultiSelectExercisePicker } from "./exercisePicker.js";
import { renderWorkouts } from "./workouts.js";
import { renderWorkoutSummary, sessionSummaryRoute } from "./summary.js";
import { setRoute } from "../router.js";
import { escapeHtml } from "../utils/format.js";
import { mountRestTimer, closeRestPanel, stopRest } from "../components/restTimer.js";
import { mountWorkoutStopwatch } from "../components/workoutStopwatch.js";

/* One exercise visible at a time. The full set of .exercise-card divs is
   built upfront and inserted into #exercise-cards; only the one with the
   .active class is displayed. Navigation (prev/next/reorder) toggles which
   card is active — never rebuilds — so unsaved set inputs, the .saved class
   on logged sets, and notes drafts all survive page navigation.

   currentIndex tracks position in workout.exercises. After a reorder we
   look up the current exercise by reference (not by old index) so the user
   stays on the same exercise even when its position changed. */
let startPending = false;

// A stalled connection gets a message rather than a Start that does nothing.
const START_LIMIT_MS = 15000;

function withinStartLimit(promise) {
    let timer;
    const limit = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Start timed out")), START_LIMIT_MS);
    });
    return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

/* Everything before the page is built. Returns null if the start was called
   off (the other workout was kept, or something failed or took too long). The
   tapped button says "Starting…" meanwhile and goes back if the start fails. */
async function prepareStart(workoutId, options) {
    const schedule = options && options.schedule ? options.schedule : null;
    const button = options && options.button ? options.button : null;
    const workout = findWorkout(workoutId);

    // Only one workout can be in progress; starting another discards it.
    const discardOther = state.currentSessionId !== null && state.currentWorkoutId !== workoutId;
    if (discardOther) {
        const other = findWorkout(state.currentWorkoutId);
        const confirmed = await showConfirmModal(
            `"${other ? other.name : "Another workout"}" is still in progress. Discard it and start "${workout.name}"?`,
            "Discard & start"
        );
        if (!confirmed) return null;
    }

    const buttonHtml = button ? button.innerHTML : "";
    if (button) {
        button.textContent = "Starting…";
        button.disabled = true;
    }
    try {
        if (discardOther) {
            try {
                await withinStartLimit(abandonSession());
            } catch (e) {
                await showConfirmModal("Couldn't discard the other workout. Check your connection and try again.", "OK");
                return null;
            }
        }

        let scheduledWorkoutId = schedule ? schedule.id : null;
        let exercises;
        try {
            if (schedule && scheduledWorkoutId === null) {
                scheduledWorkoutId = await withinStartLimit(saveRepeatDay(schedule));
            }
            exercises = await withinStartLimit(fetchWorkoutExercises(workout.id));
        } catch (e) {
            await showConfirmModal("Couldn't start this workout. Check your connection and try again.", "OK");
            return null;
        }

        // Otherwise the session is created lazily, when the first set is logged;
        // until then the workout is only "started" (remembered on the device).
        const resumeSessionId = state.currentSessionId;
        // Typed-but-unsaved values belong to the workout in progress; opening
        // any other one (or this one afresh, e.g. the next day) drops them.
        if (resumeSessionId === null && getStartedWorkoutId() !== workout.id) clearDrafts();
        if (resumeSessionId === null) markWorkoutStarted(workout.id);
        else clearStartedWorkout();

        // Exercises added, replaced or removed earlier in this workout.
        const workoutIds = exercises.map(e => e.id);
        const live = loadLiveExercises(workout.id);
        if (live) {
            try {
                exercises = await withinStartLimit(todaysExercises(exercises, live.ids));
            } catch (e) {
                await showConfirmModal("Couldn't start this workout. Check your connection and try again.", "OK");
                return null;
            }
        }

        exercises.forEach(ex => ex.sets = []);
        workout.exercises = exercises;

        return { workout, scheduledWorkoutId, resumeSessionId, workoutIds };
    } finally {
        if (button) {
            button.innerHTML = buttonHtml;
            button.disabled = false;
        }
    }
}

/* Today's list in order: the workout's own exercises where they're still in
   it, the others (added or swapped in) fetched. One that's gone from the
   library (404) is left out; anything else failing fails the start. */
async function todaysExercises(workoutExercises, ids) {
    const byId = new Map(workoutExercises.map(e => [e.id, e]));
    const list = await Promise.all(ids.map(id => byId.has(id)
        ? byId.get(id)
        : fetchExercise(id).catch(e => { if (e instanceof ApiError && e.status === 404) return null; throw e; })));
    return list.filter(Boolean);
}

/* options (optional):
   - button: the Start button that was tapped (see prepareStart).
   - schedule: the ScheduledWorkout this session fulfills. A repeat rule's day
     that isn't saved yet (id null) is saved here, after any "discard the
     other workout" question, so declining leaves it unsaved. If present, on
     a successful finish (a real session was created and saved), the
     schedule is PATCHed to COMPLETED. The PATCH is best-effort — failure is
     swallowed so the summary still shows. If the user abandons or finishes
     without logging a single set, no PATCH fires and the schedule stays
     PLANNED.
   - onComplete: where to navigate when the workout flow ends. Called both
     after the "no session logged" early exit AND from the Back button on
     the workout summary. Default is renderWorkouts.
   - exerciseId: the exercise to open on (the router passes the one that
     was showing before a reload); default is the first.

   Resume: if a session is already in progress for this workout (still open
   from earlier, or restored at boot from GET /sessions/unfinished), its
   saved sets are loaded into the rows instead of starting fresh. Leaving
   the page keeps the session; only Discard deletes it.

   Returns whether the workout opened (the router goes Home if it didn't). */
export async function startWorkout(workoutId, options) {
    // A second tap while the first is still on its way would build the page
    // twice. Only held until the page is replaced: from then on the button
    // that was tapped is gone, and Resume must still work if a load hangs.
    if (startPending) return false;
    startPending = true;
    let prepared;
    try {
        prepared = await prepareStart(workoutId, options);
    } finally {
        startPending = false;
    }
    if (prepared === null) return false;

    const { workout, scheduledWorkoutId, resumeSessionId, workoutIds } = prepared;
    const onComplete = options && options.onComplete
        ? options.onComplete
        : renderWorkouts;

    // Rebuilds the page on today's (changed) list, like a reload would, on
    // the given exercise. Typed values come back from the drafts.
    function reopen(exerciseId) {
        startWorkout(workout.id, { exerciseId, onComplete });
    }

    // Today's exercises or their order aren't the workout's own.
    function changedFromWorkout(ids) {
        const live = loadLiveExercises(workout.id);
        return live !== null && ids.join(",") !== live.workoutIds.join(",");
    }

    function saveTodaysList() {
        saveLiveExercises(workout.id, workout.exercises.map(e => e.id), workoutIds);
    }

    // Deletes the sets logged today for an exercise. False (after saying so)
    // if one couldn't be deleted; the page is then rebuilt to show what's left.
    async function deleteLoggedSets(exercise) {
        try {
            for (const set of exercise.sets.slice()) {
                try {
                    await deleteSet(set.id);
                } catch (e) {
                    if (!(e instanceof ApiError && e.status === 404)) throw e;
                }
                exercise.sets.splice(exercise.sets.indexOf(set), 1);
                touchActivity();
            }
            return true;
        } catch (e) {
            await showConfirmModal("Couldn't delete the logged sets. Check your connection and try again.", "OK");
            reopen(exercise.id);
            return false;
        }
    }

    // "The set you logged for Bench is deleted." / "The 3 sets … are deleted."
    function loggedSetsGo(n, name) {
        return n === 1
            ? `The set you logged for ${name} is deleted.`
            : `The ${n} sets you logged for ${name} are deleted.`;
    }

    async function removeExercise(exercise) {
        const n = exercise.sets.length;
        const confirmed = await showConfirmModal(n > 0
            ? `Remove ${exercise.name}? ${loggedSetsGo(n, "it")}`
            : `Remove ${exercise.name} from today's workout?`, "Remove");
        if (!confirmed) return;
        if (!(await deleteLoggedSets(exercise))) return;
        const index = workout.exercises.indexOf(exercise);
        workout.exercises.splice(index, 1);
        try { await maybeCleanupOrphanSession(workout); } catch (e) { /* the session just stays */ }
        dropExerciseDrafts(workout.id, exercise.id);
        saveTodaysList();
        const next = workout.exercises[Math.min(index, workout.exercises.length - 1)];
        reopen(next.id);
    }

    // Pick one in the library; it takes the old one's place, today only.
    function replaceExercise(exercise) {
        renderMultiSelectExercisePicker({
            title: `Replace ${exercise.name}`,
            workoutLabel: workout.name,
            excludedIds: workout.exercises.map(e => e.id),
            single: true,
            confirmLabel: () => "Replace",
            onCancel: function() { reopen(exercise.id); },
            onConfirm: async function(selected) {
                const replacement = selected[0];
                const n = exercise.sets.length;
                if (n > 0) {
                    const confirmed = await showConfirmModal(
                        `Replace ${exercise.name} with ${replacement.name}? ${loggedSetsGo(n, exercise.name)}`,
                        "Replace");
                    if (!confirmed) { reopen(exercise.id); return; }
                    if (!(await deleteLoggedSets(exercise))) return;
                }
                const index = workout.exercises.indexOf(exercise);
                workout.exercises.splice(index, 1, { id: replacement.id });
                try { await maybeCleanupOrphanSession(workout); } catch (e) { /* the session just stays */ }
                dropExerciseDrafts(workout.id, exercise.id);
                saveTodaysList();
                reopen(replacement.id);
            }
        });
    }

    function exerciseMenu(exercise) {
        const items = [{ label: "Replace exercise", onSelect: function() { replaceExercise(exercise); } }];
        if (workout.exercises.length > 1) {
            items.push({ label: "Remove exercise", danger: true, onSelect: function() { removeExercise(exercise); } });
        }
        return items;
    }

    const pageContainer = document.getElementById("app-content");
    pageContainer.innerHTML = `
        <div class="workout-title-row">
            <h2>${escapeHtml(workout.name)} - Workout</h2>
            <span class="workout-stopwatch" id="workout-stopwatch" role="timer" hidden></span>
        </div>
        <div id="exercise-pills"></div>
        <div id="exercise-nav-row">
            <button class="exercise-nav-btn exercise-nav-prev" id="exercise-nav-prev">
                <span class="exercise-nav-glyph">&#8249;</span>
                <span>Prev</span>
            </button>
            <div id="exercise-nav-counter"></div>
            <button class="exercise-nav-btn exercise-nav-next" id="exercise-nav-next">
                <span>Next</span>
                <span class="exercise-nav-glyph">&#8250;</span>
            </button>
        </div>
        <div id="exercise-cards"></div>
        <div id="preview-summary" style="display:none"></div>
    `;

    // Leaving is safe now (the resume bar brings you back), so no guard.
    clearNavGuard();
    // A live workout always lights Workouts, whether it was started from
    // there, Home (Resume / today's plan) or a calendar day.
    highlightTab("workouts");

    const cards = document.getElementById("exercise-cards");
    const previewArea = document.getElementById("preview-summary");
    const pillsRow = document.getElementById("exercise-pills");
    const navRow = document.getElementById("exercise-nav-row");
    const navCounter = document.getElementById("exercise-nav-counter");
    const prevBtn = document.getElementById("exercise-nav-prev");
    const nextBtn = document.getElementById("exercise-nav-next");
    mountRestTimer(navRow, navCounter);
    mountWorkoutStopwatch(document.getElementById("workout-stopwatch"), workout.id);

    /* currentIndex semantics:
         0 .. workout.exercises.length - 1  → an exercise is visible
         workout.exercises.length           → the preview summary is visible */
    let currentIndex = 0;

    function isOnPreview() {
        return currentIndex === workout.exercises.length;
    }

    async function setActive(newIndex) {
        currentIndex = newIndex;
        const total = workout.exercises.length;
        closeRestPanel();

        // Pills active state — none active during preview.
        for (let i = 0; i < pillsRow.children.length; i++) {
            pillsRow.children[i].classList.toggle("active", i === currentIndex);
        }

        if (isOnPreview()) {
            for (const c of cards.children) c.classList.remove("active");
            previewArea.style.display = "block";
            pillsRow.style.display = "none";
            navRow.style.display = "none";
            setNavVisible(false);
            await renderWorkoutSummary(workout, state.currentSessionId, state.currentSessionDate, {
                target: previewArea,
                mode: "preview",
                headingPrefix: "Preview -",
                onBack: function() { setActive(total - 1); },
                onFinish: function() { commitFinish(); },
                onExerciseClick: function(exercise) {
                    const idx = workout.exercises.indexOf(exercise);
                    if (idx >= 0) setActive(idx);
                }
            });
        } else {
            previewArea.style.display = "none";
            pillsRow.style.display = "";
            navRow.style.display = "";
            setNavVisible(true);
            setRoute(`#/live?exercise=${workout.exercises[currentIndex].id}`);
            for (let i = 0; i < cards.children.length; i++) {
                cards.children[i].classList.toggle("active", i === currentIndex);
            }
            navCounter.textContent = `${currentIndex + 1} / ${total}`;
            prevBtn.disabled = currentIndex === 0;
            nextBtn.disabled = false;
            // Scroll active pill into view if it's off-screen horizontally
            const activePill = pillsRow.children[currentIndex];
            if (activePill) activePill.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
    }

    prevBtn.onclick = function() {
        if (currentIndex > 0) setActive(currentIndex - 1);
    };
    nextBtn.onclick = function() {
        if (currentIndex < workout.exercises.length) setActive(currentIndex + 1);
    };

    // Review is reached with Next on the last exercise; Add and Discard
    // live in the ⋮ on the title line.
    pageContainer.querySelector(".workout-title-row").appendChild(
        createMoreButton("Workout options", function() {
            return [
                { label: "Add exercise", onSelect: addExercises },
                { label: "Discard workout", danger: true, onSelect: discardWorkout }
            ];
        }));

    // Pick one or more in the library; they go at the end, today only, and
    // the first of them shows.
    function addExercises() {
        const showing = workout.exercises[Math.min(currentIndex, workout.exercises.length - 1)];
        renderMultiSelectExercisePicker({
            title: `Add to ${workout.name}`,
            excludedIds: workout.exercises.map(e => e.id),
            confirmLabel: n => n === 1 ? "Add 1 exercise" : `Add ${n} exercises`,
            onCancel: function() { reopen(showing.id); },
            onConfirm: async function(selected) {
                for (const ex of selected) workout.exercises.push({ id: ex.id });
                saveTodaysList();
                reopen(selected[0].id);
            }
        });
    }

    // Red menu items always ask first, even before any set is logged.
    async function discardWorkout() {
        const hasSets = state.currentSessionId !== null;
        const confirmed = await showConfirmModal(hasSets
            ? "Discard this workout? The sets you logged are deleted."
            : "Discard this workout?", "Discard");
        if (!confirmed) return;
        if (hasSets) {
            try {
                await abandonSession();
            } catch (e) {
                await showConfirmModal("Couldn't discard. Check your connection and try again.", "OK");
                return;
            }
        }
        clearStartedWorkout();
        clearDrafts();
        stopRest();
        onComplete();
    }

    /* Handle a pill drag-to-reorder. The helper leaves the dragged pill in
       its original DOM position (just snaps the position:fixed lift back),
       so we manually move the pill, the workout.exercises entry, and the
       exercise-cards DOM into their new positions, then re-renumber pill
       labels and refresh the active state by exercise reference. */
    function onPillReorder(from, to) {
        const wasOnPreview = isOnPreview();
        const currentRef = wasOnPreview ? null : workout.exercises[currentIndex];

        const [moved] = workout.exercises.splice(from, 1);
        workout.exercises.splice(to, 0, moved);

        const pillEl = pillsRow.children[from];
        pillsRow.removeChild(pillEl);
        const pillRef = pillsRow.children[to] || null;
        pillsRow.insertBefore(pillEl, pillRef);

        const cardEl = cards.children[from];
        cards.removeChild(cardEl);
        const refNode = cards.children[to] || null;
        cards.insertBefore(cardEl, refNode);

        for (let i = 0; i < pillsRow.children.length; i++) {
            pillsRow.children[i].textContent = String(i + 1);
        }
        // Kept like any other change to today's list, so a reload or a
        // rebuild (add, replace, remove) doesn't undo it.
        saveTodaysList();

        const total = workout.exercises.length;
        if (wasOnPreview) {
            setActive(total);
        } else {
            const newIdx = workout.exercises.indexOf(currentRef);
            setActive(newIdx >= 0 ? newIdx : 0);
        }
    }

    // One round-trip per exercise, so fetch them all at once rather than
    // awaiting each in turn. When resuming, "last time" means before this
    // session, and the session's own sets fill the rows.
    const [lastSetsByExercise, resumedSets] = await Promise.all([
        Promise.all(workout.exercises.map(ex =>
            fetchLastSets(workout.id, ex.id, resumeSessionId ?? undefined))),
        resumeSessionId !== null ? fetchSessionSets(resumeSessionId) : Promise.resolve([])
    ]);

    for (let i = 0; i < workout.exercises.length; i++) {
        const exercise = workout.exercises[i];
        const isUnilateral = exercise.unilateral === true;

        exercise.previousSets = lastSetsByExercise[i];
        if (isUnilateral) {
            exercise.previousLSets = exercise.previousSets.filter(s => s.side === "LEFT");
            exercise.previousRSets = exercise.previousSets.filter(s => s.side === "RIGHT");
        }
        const saved = resumedSets
            .filter(s => s.exerciseId === exercise.id)
            .sort((a, b) => a.id - b.id);
        exercise.sets = saved.slice();

        // Pill — tap to jump, long-press + horizontal drag to reorder.
        const pill = document.createElement("button");
        pill.className = "exercise-pill";
        pill.textContent = String(i + 1);
        pill.onclick = function() {
            const idx = Array.from(pillsRow.children).indexOf(pill);
            if (idx >= 0) setActive(idx);
        };
        if (workout.exercises.length > 1) {
            attachLongPressDrag(pill, {
                axis: "x",
                onReorder: onPillReorder
            });
        }
        pillsRow.appendChild(pill);

        const card = document.createElement("div");
        card.className = "exercise-card";
        card.innerHTML = `
            <div class="exercise-card-head">
                <h3 class="exercise-card-title">${escapeHtml(exercise.name)}</h3>
            </div>
            <div id="sets-${i}"></div>
        `;
        card.querySelector(".exercise-card-title").onclick = function() {
            showExerciseReadOnlyModal(exercise);
        };
        card.querySelector(".exercise-card-head").appendChild(
            createMoreButton(`Options for ${exercise.name}`, function() { return exerciseMenu(exercise); }));

        const addSetBtn = document.createElement("button");
        addSetBtn.className = "add-set-btn";
        addSetBtn.textContent = "Add Set";
        addSetBtn.onclick = function() {
            const setsContainer = document.getElementById("sets-" + i);
            if (isUnilateral) {
                setsContainer.appendChild(createInputRow(workout, exercise, i, "LEFT"));
                setsContainer.appendChild(createInputRow(workout, exercise, i, "RIGHT"));
            } else {
                setsContainer.appendChild(createInputRow(workout, exercise, i, null));
            }
            updateHeaderVisibility(i);
            renumberSetRows(i, exercise);
        };

        card.appendChild(addSetBtn);
        card.appendChild(createNotesPanel(exercise));
        cards.appendChild(card);

        const setsContainer = document.getElementById("sets-" + i);
        // One row per previous set (as placeholders), or more if this
        // session already logged more; saved sets fill the first rows.
        if (isUnilateral) {
            const savedL = saved.filter(s => s.side === "LEFT");
            const savedR = saved.filter(s => s.side === "RIGHT");
            const pairCount = Math.max(exercise.previousLSets.length, exercise.previousRSets.length,
                savedL.length, savedR.length);
            for (let k = 0; k < pairCount; k++) {
                setsContainer.appendChild(createInputRow(workout, exercise, i, "LEFT", savedL[k]));
                setsContainer.appendChild(createInputRow(workout, exercise, i, "RIGHT", savedR[k]));
            }
        } else {
            const rowCount = Math.max(exercise.previousSets.length, saved.length);
            for (let k = 0; k < rowCount; k++) {
                setsContainer.appendChild(createInputRow(workout, exercise, i, null, saved[k]));
            }
        }
        updateHeaderVisibility(i);
        renumberSetRows(i, exercise);
    }

    restoreDrafts();
    const startIndex = workout.exercises.findIndex(e => e.id === (options && options.exerciseId));
    setActive(Math.max(startIndex, 0));
    return true;

    /* Typed-but-unsaved values from before a reload go into the first
       unsaved rows of their exercise and side, adding rows if needed. */
    function restoreDrafts() {
        const drafts = loadDrafts(workout.id);
        workout.exercises.forEach(function(exercise, i) {
            const bySide = drafts[exercise.id];
            if (!bySide) return;
            const container = document.getElementById("sets-" + i);
            const unsavedRows = key => Array.from(container.querySelectorAll(".set-input-row"))
                .filter(r => !r._savedSet && sideKey(r.dataset.side) === key);
            for (const key of Object.keys(bySide)) {
                const list = bySide[key];
                while (unsavedRows(key).length < list.length) {
                    if (exercise.unilateral === true) {
                        container.appendChild(createInputRow(workout, exercise, i, "LEFT"));
                        container.appendChild(createInputRow(workout, exercise, i, "RIGHT"));
                    } else {
                        container.appendChild(createInputRow(workout, exercise, i, null));
                    }
                }
                updateHeaderVisibility(i);
                renumberSetRows(i, exercise);
                const rows = unsavedRows(key);
                list.forEach((d, k) => rows[k]._applyDraft(d));
            }
        });
    }

    /* Exercises added, replaced or removed today: ask whether that was for
       today only or the workout from now on. "none" when nothing changed,
       null for Cancel, otherwise "today" or "update". */
    async function askAboutChanges(ids) {
        if (!changedFromWorkout(ids)) return "none";
        return showChoiceModal(
            `You changed the exercises in ${workout.name} today. Keep the changes for today only, or update ${workout.name} from now on?`,
            [
                { label: "Today only", value: "today" },
                { label: `Update ${workout.name}`, value: "update" }
            ]);
    }

    async function commitFinish() {
        const ids = workout.exercises.map(e => e.id);
        // Either answer finishes; Cancel stays on the review.
        const choice = await askAboutChanges(ids);
        if (choice === null) return;
        if (state.currentSessionId === null) {
            // Nothing logged, so nothing to save as a session, but the
            // changes can still go into the workout.
            if (choice === "update") {
                try {
                    await setWorkoutExerciseList(workout.id, ids);
                } catch (e) {
                    await showConfirmModal(`Couldn't update ${workout.name}. Check your connection and try again.`, "OK");
                    return;
                }
            }
            clearStartedWorkout();
            clearDrafts();
            stopRest();
            setNavVisible(true);
            onComplete();
            return;
        }
        const sessionId = state.currentSessionId;
        const sessionDate = state.currentSessionDate;
        let exact = null;
        if (choice !== "none") {
            exact = { exerciseIds: ids, updateWorkout: choice === "update" };
        } else if (loadLiveExercises(workout.id)) {
            // Changed and changed back (e.g. dragged away and back again):
            // the workout's own list, so nothing to ask.
            exact = { exerciseIds: ids, updateWorkout: false };
        }
        try {
            await finishSession(sessionId, ids, undefined, exact);
        } catch (e) {
            // Keep the session in progress (resumable) and stay on the preview.
            await showConfirmModal("Couldn't finish the workout. Check your connection and try again.", "OK");
            return;
        }
        clearCurrentSession();
        clearDrafts();
        stopRest();
        setNavVisible(true);
        await syncCalendarOnFinish(workout.id, sessionId, sessionDate, scheduledWorkoutId);
        setRoute(sessionSummaryRoute(workout.id, sessionId, sessionDate));
        await renderWorkoutSummary(workout, sessionId, sessionDate, { onBack: onComplete });
    }
}

/* Best-effort calendar sync on workout finish.
   - Started-from-schedule: PATCH that row to COMPLETED + link sessionId. If it
     has gone since (the repeat was stopped), carry on as ad-hoc.
   - Ad-hoc, same workout PLANNED or SKIPPED on the session date (the plan,
     not yet done): PATCH it to COMPLETED + link sessionId, so the calendar
     shows what happened instead of a plan next to a completion.
   - Ad-hoc on a repeat rule's unsaved day (id null, so nothing to PATCH): POST
     a COMPLETED row with its repeatDate, so the rule stops drawing that day.
   - Otherwise POST a new COMPLETED row carrying sessionId. In particular an
     existing COMPLETED row belongs to another session (same workout twice in
     a day) and must not be taken over.
   The sessionId link lets the calendar's day modal open the session summary
   when the user taps a COMPLETED row. Failures are swallowed — the workout
   summary still renders. */
export async function syncCalendarOnFinish(workoutId, sessionId, date, scheduledWorkoutId) {
    try {
        if (scheduledWorkoutId !== null) {
            const resp = await updateSchedule(scheduledWorkoutId, { status: "COMPLETED", sessionId: sessionId });
            if (resp.status !== 404) return;
        }
        const existing = await fetchSchedulesByDate(date);
        const match = existing.find(s =>
            s.workoutId === workoutId && s.status !== "COMPLETED" && s.sessionId == null);
        if (match && match.id !== null) {
            await updateSchedule(match.id, { status: "COMPLETED", sessionId: sessionId });
        } else {
            await createSchedule({
                date: date,
                workoutId: workoutId,
                status: "COMPLETED",
                sessionId: sessionId,
                repeatDate: match ? match.repeatDate : null
            });
        }
    } catch (e) { /* swallow */ }
}
