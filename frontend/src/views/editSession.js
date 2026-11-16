import { findWorkout } from "../state.js";
import { fetchSessionExercises, fetchSessionSets, fetchLastSets, fetchLastDone,
         addSessionExercises, removeSessionExercise, replaceSessionExercise, removeSessionIfEmpty, ApiError } from "../api.js";
import { setHints, appendExerciseCard, loggedSetsGo } from "../components/exerciseCard.js";
import { createMoreButton } from "../components/actionMenu.js";
import { showConfirmModal } from "../components/modals.js";
import { resetExercise } from "../components/resetExercise.js";
import { renderMultiSelectExercisePicker } from "./exercisePicker.js";
import { viewPastSessions } from "./pastSessions.js";
import { settleSaves } from "../components/setInputRow.js";
import { clearNavGuard, setNavVisible } from "../components/bottomNav.js";
import { setRoute } from "../router.js";
import { escapeHtml, formatShortDate } from "../utils/format.js";

/* Editing a finished workout (editing history), on the same set-logging
   page as a live one: its exercises as they were logged (the finish
   snapshot), pills and Prev / Next, every set saving as it's typed
   (setInputRow.js, via workout.pastSessionId). Next on the last exercise
   goes to onDone (its summary). No tab bar, as in a live workout. The ⋮
   menus as live, for that day only (the workout's own list stays): Add
   exercise on the title, Replace / Remove / Reset exercise on each card.
   Nothing else of a live workout: no rest timer, stopwatch, auto-end,
   Reset / Discard workout, review or Finish.
   A live workout open meanwhile is untouched.
   Left with no sets at all (✕, Remove or Reset), the session is tidied
   away on leaving, as every other way of emptying a workout does; if the
   app is closed instead, at its next start (tidyLeftSessions).

   options:
   - exerciseId: the exercise to open on (default the first)
   - onBack(): ‹ Back
   - onDone(): Next on the last exercise
   - onGone(): instead of onBack / onDone when leaving tidies the session
     away; default its Past sessions
   - backRoute: where onBack goes, kept in the route so a reload knows
     ("exercises/7/history": opened from that History tab; router.js)
   Returns false if the session can't be loaded (deleted meanwhile). */
export async function editPastSession(workoutId, sessionId, sessionDate, options) {
    const opts = options || {};
    const shared = findWorkout(workoutId);
    let snapshot, sets;
    try {
        [snapshot, sets] = await Promise.all([fetchSessionExercises(sessionId), fetchSessionSets(sessionId)]);
    } catch (e) {
        return false;
    }
    // Its own object: the workout list's entry may be the live workout's.
    const workout = {
        id: workoutId,
        name: shared ? shared.name : "Workout",
        pastSessionId: sessionId,
        exercises: snapshot.map(s => ({ ...s, id: s.exerciseId }))
    };
    if (workout.exercises.length === 0) return false;

    // "Last time" is the time before this workout.
    const lastSets = await Promise.all(workout.exercises.map(ex =>
        fetchLastSets(workoutId, ex.id, sessionId).catch(() => [])));
    const elsewhere = await Promise.all(workout.exercises.map((ex, i) =>
        lastSets[i].length > 0 ? null : fetchLastDone(ex.id, sessionId).catch(() => null)));

    clearNavGuard();
    const page = document.getElementById("app-content");
    page.innerHTML = `
        <button type="button" class="back-link" id="edit-session-back-btn"><svg class="back-glyph" viewBox="0 0 10 16" aria-hidden="true"><path d="M8 2 2 8l6 6"/></svg> Back</button>
        <div class="workout-title-row">
            <h2>${escapeHtml(workout.name)} - ${formatShortDate(sessionDate)}</h2>
        </div>
        <div id="exercise-pills"></div>
        <div id="exercise-nav-row" class="edit-session-nav">
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
    `;
    // Checked on leaving; noted on the device in case the app is closed here.
    noteToTidy(sessionId, true);
    // A row being typed in saves when it loses focus: wait for that (and any
    // save on its way) so the page left to shows the change. With no sets
    // left at all, the session goes.
    const gone = opts.onGone || function() { viewPastSessions(workoutId); };
    async function leave(then) {
        if (document.activeElement) document.activeElement.blur();
        await settleSaves();
        if (await tidy(sessionId)) then = gone;
        setNavVisible(true);
        if (then) then();
    }
    // No tab bar, as in a live workout; ‹ Back and Next are the ways out,
    // and both bring it back (leave).
    setNavVisible(false);
    document.getElementById("edit-session-back-btn").onclick = function() { leave(opts.onBack); };

    // After a change: the page again (fetched afresh, so hints and rows
    // follow) on that exercise; if the workout is gone, out.
    async function rebuild(exerciseId) {
        const opened = await editPastSession(workoutId, sessionId, sessionDate, { ...opts, exerciseId });
        if (!opened) leave(gone);
    }
    // A row being typed in saves first, so a change starts from what's saved.
    async function settle() {
        if (document.activeElement) document.activeElement.blur();
        await settleSaves();
    }
    async function failed(exerciseId) {
        await showConfirmModal("Couldn't change the workout. Check your connection and try again.", "OK");
        rebuild(exerciseId);
    }

    // Pick one or more; they go at the end, the first of them shows.
    async function addExercises() {
        await settle();
        const showing = workout.exercises[currentIndex];
        renderMultiSelectExercisePicker({
            title: `Add to ${workout.name} - ${formatShortDate(sessionDate)}`,
            excludedIds: workout.exercises.map(e => e.id),
            confirmLabel: n => n === 1 ? "Add 1 exercise" : `Add ${n} exercises`,
            onCancel: function() { rebuild(showing.id); },
            onConfirm: async function(selected) {
                try {
                    await addSessionExercises(sessionId, selected.map(e => e.id));
                } catch (e) {
                    return failed(showing.id);
                }
                rebuild(selected[0].id);
            }
        });
    }

    // Pick one; it takes the old one's place, whose sets here go (asked first).
    async function replaceOne(exercise) {
        await settle();
        renderMultiSelectExercisePicker({
            title: `Replace ${exercise.name}`,
            workoutLabel: workout.name,
            excludedIds: workout.exercises.map(e => e.id),
            single: true,
            confirmLabel: () => "Replace",
            onCancel: function() { rebuild(exercise.id); },
            onConfirm: async function(selected) {
                const replacement = selected[0];
                const n = exercise.sets.length;
                if (n > 0 && !(await showConfirmModal(
                        `Replace ${exercise.name} with ${replacement.name}? ${loggedSetsGo(n, exercise.name)}`, "Replace"))) {
                    return rebuild(exercise.id);
                }
                try {
                    await replaceSessionExercise(sessionId, exercise.id, replacement.id);
                } catch (e) {
                    return failed(exercise.id);
                }
                rebuild(replacement.id);
            }
        });
    }

    // Its sets here go; the next one shows (the last: the one before).
    async function removeOne(exercise) {
        await settle();
        const n = exercise.sets.length;
        if (!(await showConfirmModal(n > 0
                ? `Remove ${exercise.name}? ${loggedSetsGo(n, "it")}`
                : `Remove ${exercise.name} from this workout?`, "Remove"))) return;
        const index = workout.exercises.indexOf(exercise);
        try {
            await removeSessionExercise(sessionId, exercise.id);
        } catch (e) {
            return failed(exercise.id);
        }
        const rest = workout.exercises.filter(e => e !== exercise);
        rebuild(rest[Math.min(index, rest.length - 1)].id);
    }

    /* Reset exercise as anywhere else (its history in every workout goes),
       but this workout keeps it, with empty rows, and itself even with no
       sets left until the page is left (leave). */
    async function resetOne(exercise) {
        await settle();
        if (!(await resetExercise(exercise, 0, sessionId))) return;
        rebuild(exercise.id);
    }

    function exerciseMenu(exercise) {
        const items = [{ label: "Replace exercise", onSelect: function() { replaceOne(exercise); } }];
        if (workout.exercises.length > 1) {
            items.push({ label: "Remove exercise", danger: true, onSelect: function() { removeOne(exercise); } });
        }
        items.push({ label: "Reset exercise", danger: true, onSelect: function() { resetOne(exercise); } });
        return items;
    }

    page.querySelector(".workout-title-row").appendChild(createMoreButton("Workout options", function() {
        return [{ label: "Add exercise", onSelect: addExercises }];
    }));

    const pillsRow = document.getElementById("exercise-pills");
    const cards = document.getElementById("exercise-cards");
    const counter = document.getElementById("exercise-nav-counter");
    const prevBtn = document.getElementById("exercise-nav-prev");
    const nextBtn = document.getElementById("exercise-nav-next");

    workout.exercises.forEach(function(exercise, i) {
        setHints(exercise, lastSets[i], elsewhere[i]);
        const saved = sets.filter(s => s.exerciseId === exercise.id).sort((a, b) => a.id - b.id);

        const pill = document.createElement("button");
        pill.className = "exercise-pill";
        pill.textContent = String(i + 1);
        pill.onclick = function() { setActive(i); };
        pillsRow.appendChild(pill);

        appendExerciseCard(cards, workout, exercise, i, {
            saved, elsewhere: elsewhere[i], menu: function() { return exerciseMenu(exercise); }
        });
    });

    let currentIndex = 0;
    function setActive(index) {
        currentIndex = index;
        const total = workout.exercises.length;
        for (let i = 0; i < total; i++) {
            pillsRow.children[i].classList.toggle("active", i === index);
            cards.children[i].classList.toggle("active", i === index);
        }
        counter.textContent = `${index + 1} / ${total}`;
        prevBtn.disabled = index === 0;
        setRoute(editSessionRoute(workoutId, sessionId, sessionDate, workout.exercises[index].id, opts.backRoute));
        const pill = pillsRow.children[index];
        if (pill) pill.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    prevBtn.onclick = function() {
        if (currentIndex > 0) setActive(currentIndex - 1);
    };
    nextBtn.onclick = function() {
        if (currentIndex < workout.exercises.length - 1) {
            setActive(currentIndex + 1);
            return;
        }
        leave(opts.onDone);
    };

    const start = workout.exercises.findIndex(e => e.id === opts.exerciseId);
    setActive(Math.max(start, 0));
    return true;
}

export function editSessionRoute(workoutId, sessionId, sessionDate, exerciseId, backRoute) {
    return `#/workouts/${workoutId}/sessions/${sessionId}/edit?date=${sessionDate}&exercise=${exerciseId}`
        + (backRoute ? `&back=${backRoute}` : "");
}

/* Past workouts whose editing page was opened and not yet checked on
   leaving (the app closed on it, or offline then): ids on the device. */
const TIDY_KEY = "fitness.tidyAfterEdit";

function notedToTidy() {
    try {
        const ids = JSON.parse(localStorage.getItem(TIDY_KEY));
        return Array.isArray(ids) ? ids.filter(Number.isInteger) : [];
    } catch (e) {
        return [];
    }
}

function noteToTidy(sessionId, on) {
    const ids = notedToTidy().filter(id => id !== sessionId);
    if (on) ids.push(sessionId);
    try {
        localStorage.setItem(TIDY_KEY, JSON.stringify(ids));
    } catch (e) { /* private mode etc.: only the check on leaving */ }
}

// The session goes if it has no sets left. True if it went. The note is
// kept only when the check couldn't be made (offline), for the next start.
async function tidy(sessionId) {
    try {
        const { removed } = await removeSessionIfEmpty(sessionId);
        noteToTidy(sessionId, false);
        return removed;
    } catch (e) {
        if (e instanceof ApiError) noteToTidy(sessionId, false);   // gone, or not finished
        return false;
    }
}

/* At start-up (main.js, after the route is open): the noted sessions are
   checked, except one whose editing page just reopened (checked when it's
   left). */
export async function tidyLeftSessions() {
    const open = location.hash.match(/^#\/workouts\/\d+\/sessions\/(\d+)\/edit/);
    for (const id of notedToTidy()) {
        if (open && Number(open[1]) === id) continue;
        await tidy(id);
    }
}
