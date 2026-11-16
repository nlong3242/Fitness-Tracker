import { createInputRow, updateHeaderVisibility, renumberSetRows } from "./setInputRow.js";
import { showExerciseReadOnlyModal } from "./modals.js";
import { createNotesPanel } from "./notesPanel.js";
import { createMoreButton } from "./actionMenu.js";
import { escapeHtml, formatShortDate } from "../utils/format.js";

/* An exercise's card on the set-logging page, shared by the live workout
   (views/activeWorkout.js) and editing a finished one (views/editSession.js). */

/* Last time's sets become the rows' hints and arrows: this workout's, or,
   when it was never done here, the last time in any workout (elsewhere,
   from GET /exercises/{id}/last-done). */
export function setHints(exercise, lastSets, elsewhere) {
    exercise.previousSets = elsewhere ? elsewhere.sets : lastSets;
    if (exercise.unilateral === true) {
        exercise.previousLSets = exercise.previousSets.filter(s => s.side === "LEFT");
        exercise.previousRSets = exercise.previousSets.filter(s => s.side === "RIGHT");
    }
}

// Replace / Remove asking first: "The set you logged for Bench is deleted."
// / "The 3 sets … are deleted."
export function loggedSetsGo(n, name) {
    return n === 1
        ? `The set you logged for ${name} is deleted.`
        : `The ${n} sets you logged for ${name} are deleted.`;
}

/* Builds the card into cards (it must be on the page before its rows are
   numbered): the title (tap for details), an optional ⋮ (menu() returns its
   items), the "Last time: from …" note when the hints are from elsewhere,
   one row per set last time or per saved set (saved sets fill the first
   rows), Add Set and the notes panel. Call setHints first. */
export function appendExerciseCard(cards, workout, exercise, i, { saved, elsewhere, menu }) {
    const isUnilateral = exercise.unilateral === true;
    exercise.sets = saved.slice();

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
    if (menu) {
        card.querySelector(".exercise-card-head").appendChild(
            createMoreButton(`Options for ${exercise.name}`, menu));
    }
    if (elsewhere) {
        const note = document.createElement("p");
        note.className = "last-done-note";
        note.textContent = `Last time: from ${elsewhere.workoutName || "another workout"}, ${formatShortDate(elsewhere.date)}`;
        card.querySelector(".exercise-card-head").after(note);
    }

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
    return card;
}
