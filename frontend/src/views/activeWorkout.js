import { state, findWorkout, clearCurrentSession } from "../state.js";
import {
    fetchWorkoutExercises,
    fetchLastSets,
    fetchSessionSets,
    finishSession,
    updateSchedule,
    fetchSchedulesByDate,
    createSchedule
} from "../api.js";
import {
    showExerciseReadOnlyModal,
    showConfirmModal
} from "../components/modals.js";
import { createNotesPanel } from "../components/notesPanel.js";
import {
    createInputRow,
    updateHeaderVisibility,
    renumberSetRows
} from "../components/setInputRow.js";
import { attachLongPressDrag } from "../utils/dragDrop.js";
import { clearNavGuard, setNavVisible } from "../components/bottomNav.js";
import { abandonSession, markWorkoutStarted, clearStartedWorkout, getStartedWorkoutId } from "../session.js";
import { loadDrafts, clearDrafts, sideKey } from "../drafts.js";
import { renderWorkouts } from "./workouts.js";
import { renderWorkoutSummary } from "./summary.js";
import { escapeHtml } from "../utils/format.js";

/* One exercise visible at a time. The full set of .exercise-card divs is
   built upfront and inserted into #exercise-cards; only the one with the
   .active class is displayed. Navigation (prev/next/reorder) toggles which
   card is active — never rebuilds — so unsaved set inputs, the .saved class
   on logged sets, and notes drafts all survive page navigation.

   currentIndex tracks position in workout.exercises. After a reorder we
   look up the current exercise by reference (not by old index) so the user
   stays on the same exercise even when its position changed. */
/* options (optional):
   - scheduledWorkoutId: id of the ScheduledWorkout this session fulfills. If
     present, on a successful finish (a real session was created and saved),
     the schedule is PATCHed to COMPLETED. The PATCH is best-effort —
     failure is swallowed so the summary still shows. If the user abandons
     or finishes without logging a single set, no PATCH fires and the
     schedule stays PLANNED.
   - onComplete: where to navigate when the workout flow ends. Called both
     after the "no session logged" early exit AND from the Back button on
     the workout summary. Default is renderWorkouts.

   Resume: if a session is already in progress for this workout (still open
   from earlier, or restored at boot from GET /sessions/unfinished), its
   saved sets are loaded into the rows instead of starting fresh. Leaving
   the page keeps the session; only Discard deletes it. */
export async function startWorkout(workoutId, options) {
    const scheduledWorkoutId = options && options.scheduledWorkoutId
        ? options.scheduledWorkoutId
        : null;
    const onComplete = options && options.onComplete
        ? options.onComplete
        : renderWorkouts;

    const workout = findWorkout(workoutId);

    // Only one workout can be in progress; starting another discards it.
    if (state.currentSessionId !== null && state.currentWorkoutId !== workoutId) {
        const other = findWorkout(state.currentWorkoutId);
        const confirmed = await showConfirmModal(
            `"${other ? other.name : "Another workout"}" is still in progress. Discard it and start "${workout.name}"?`,
            "Discard & start"
        );
        if (!confirmed) return;
        try {
            await abandonSession();
        } catch (e) {
            await showConfirmModal("Couldn't discard the other workout. Check your connection and try again.", "OK");
            return;
        }
    }

    // Otherwise the session is created lazily, when the first set is logged;
    // until then the workout is only "started" (remembered on the device).
    const resumeSessionId = state.currentSessionId;
    // Typed-but-unsaved values belong to the workout in progress; opening
    // any other one (or this one afresh, e.g. the next day) drops them.
    if (resumeSessionId === null && getStartedWorkoutId() !== workout.id) clearDrafts();
    if (resumeSessionId === null) markWorkoutStarted(workout.id);
    else clearStartedWorkout();

    const exercises = await fetchWorkoutExercises(workout.id);
    exercises.forEach(ex => ex.sets = []);
    workout.exercises = exercises;

    const pageContainer = document.getElementById("app-content");
    pageContainer.innerHTML = `
        <h2>${escapeHtml(workout.name)} - Workout</h2>
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
        <div class="page-actions">
            <button id="active-workout-finish-btn">Review &amp; Finish</button>
            <button class="btn-danger" id="active-workout-discard-btn">Discard</button>
        </div>
    `;

    // Leaving is safe now (the resume bar brings you back), so no guard.
    clearNavGuard();

    const cards = document.getElementById("exercise-cards");
    const previewArea = document.getElementById("preview-summary");
    const pillsRow = document.getElementById("exercise-pills");
    const navRow = document.getElementById("exercise-nav-row");
    const pageActions = pageContainer.querySelector(".page-actions");
    const navCounter = document.getElementById("exercise-nav-counter");
    const prevBtn = document.getElementById("exercise-nav-prev");
    const nextBtn = document.getElementById("exercise-nav-next");

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

        // Pills active state — none active during preview.
        for (let i = 0; i < pillsRow.children.length; i++) {
            pillsRow.children[i].classList.toggle("active", i === currentIndex);
        }

        if (isOnPreview()) {
            for (const c of cards.children) c.classList.remove("active");
            previewArea.style.display = "block";
            pillsRow.style.display = "none";
            navRow.style.display = "none";
            pageActions.style.display = "none";
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
            pageActions.style.display = "";
            setNavVisible(true);
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

    document.getElementById("active-workout-finish-btn").onclick = function() {
        setActive(workout.exercises.length);
    };

    document.getElementById("active-workout-discard-btn").onclick = async function() {
        if (state.currentSessionId !== null) {
            const confirmed = await showConfirmModal(
                "Discard this workout? The sets you logged are deleted.", "Discard");
            if (!confirmed) return;
            try {
                await abandonSession();
            } catch (e) {
                await showConfirmModal("Couldn't discard. Check your connection and try again.", "OK");
                return;
            }
        }
        clearStartedWorkout();
        clearDrafts();
        onComplete();
    };

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
            <h3 class="exercise-card-title">${escapeHtml(exercise.name)}</h3>
            <div id="sets-${i}"></div>
        `;
        card.querySelector(".exercise-card-title").onclick = function() {
            showExerciseReadOnlyModal(exercise);
        };

        const addSetBtn = document.createElement("button");
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
    setActive(0);

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
                list.forEach((d, k) => rows[k]._applyDraft(d.w, d.r));
            }
        });
    }

    async function commitFinish() {
        if (state.currentSessionId === null) {
            clearStartedWorkout();
            clearDrafts();
            setNavVisible(true);
            onComplete();
            return;
        }
        const sessionId = state.currentSessionId;
        const sessionDate = state.currentSessionDate;
        try {
            await finishSession(sessionId, workout.exercises.map(e => e.id));
        } catch (e) {
            // Keep the session in progress (resumable) and stay on the preview.
            await showConfirmModal("Couldn't finish the workout. Check your connection and try again.", "OK");
            return;
        }
        clearCurrentSession();
        clearDrafts();
        setNavVisible(true);
        await syncCalendarOnFinish(workout.id, sessionId, sessionDate, scheduledWorkoutId);
        await renderWorkoutSummary(workout, sessionId, sessionDate, { onBack: onComplete });
    }
}

/* Best-effort calendar sync on workout finish.
   - Started-from-schedule: PATCH that row to COMPLETED + link sessionId.
   - Ad-hoc, same workout PLANNED or SKIPPED on the session date (the plan,
     not yet done): PATCH it to COMPLETED + link sessionId, so the calendar
     shows what happened instead of a plan next to a completion.
   - Otherwise POST a new COMPLETED row carrying sessionId. In particular an
     existing COMPLETED row belongs to another session (same workout twice in
     a day) and must not be taken over.
   The sessionId link lets the calendar's day modal open the session summary
   when the user taps a COMPLETED row. Failures are swallowed — the workout
   summary still renders. */
export async function syncCalendarOnFinish(workoutId, sessionId, date, scheduledWorkoutId) {
    try {
        if (scheduledWorkoutId !== null) {
            await updateSchedule(scheduledWorkoutId, { status: "COMPLETED", sessionId: sessionId });
            return;
        }
        const existing = await fetchSchedulesByDate(date);
        const match = existing.find(s =>
            s.workoutId === workoutId && s.status !== "COMPLETED" && s.sessionId == null);
        if (match) {
            await updateSchedule(match.id, { status: "COMPLETED", sessionId: sessionId });
        } else {
            await createSchedule({
                date: date,
                workoutId: workoutId,
                status: "COMPLETED",
                sessionId: sessionId
            });
        }
    } catch (e) { /* swallow */ }
}
