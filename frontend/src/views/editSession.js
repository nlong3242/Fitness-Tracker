import { findWorkout } from "../state.js";
import { fetchSessionExercises, fetchSessionSets, fetchLastSets, fetchLastDone } from "../api.js";
import { setHints, appendExerciseCard } from "../components/exerciseCard.js";
import { settleSaves } from "../components/setInputRow.js";
import { clearNavGuard, setNavVisible } from "../components/bottomNav.js";
import { setRoute } from "../router.js";
import { escapeHtml, formatShortDate } from "../utils/format.js";

/* Editing a finished workout (editing history), on the same set-logging
   page as a live one: its exercises as they were logged (the finish
   snapshot), pills and Prev / Next, every set saving as it's typed
   (setInputRow.js, via workout.pastSessionId). Next on the last exercise
   goes to onDone (its summary). No tab bar, as in a live workout. Nothing
   else of a live workout: no rest timer, stopwatch, auto-end, ⋮ menus,
   review or Finish.
   A live workout open meanwhile is untouched.

   options:
   - exerciseId: the exercise to open on (default the first)
   - onBack(): ‹ Back
   - onDone(): Next on the last exercise
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
        <button class="summary-back-link" id="edit-session-back-btn"><span class="summary-back-glyph">&#8249;</span> Back</button>
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
    // A row being typed in saves when it loses focus: wait for that (and any
    // save on its way) so the page left to shows the change.
    async function leave(then) {
        if (document.activeElement) document.activeElement.blur();
        await settleSaves();
        setNavVisible(true);
        if (then) then();
    }
    // No tab bar, as in a live workout; ‹ Back and Next are the ways out,
    // and both bring it back (leave).
    setNavVisible(false);
    document.getElementById("edit-session-back-btn").onclick = function() { leave(opts.onBack); };

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

        appendExerciseCard(cards, workout, exercise, i, { saved, elsewhere: elsewhere[i] });
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
