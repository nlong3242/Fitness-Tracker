import { logTypeLabel } from "../config.js";
import { escapeHtml, formatCategoryLabel } from "../utils/format.js";

/* An exercise's Overview, read-only: a row of tags (group, type,
   equipment, level, Built-in or Custom), the cues as a list (one line of
   the cues per point; built-in exercises have their step-by-step
   instructions there), the muscles, whether it's logged a side at a time,
   and the user's note. Used on the exercise page (views/exercisePage.js)
   and in the live workout's exercise popup (modals.js). */
export function exerciseOverviewHtml(exercise) {
    const tags = [
        formatCategoryLabel(exercise.category),
        exercise.exerciseType,
        exercise.equipment,
        exercise.level,
    ].filter(Boolean).map(t => `<span class="exo-tag">${escapeHtml(t)}</span>`);
    // Past sessions' copies of an exercise don't say which kind it was.
    if (exercise.builtIn === true) tags.push(`<span class="exo-tag exo-tag-kind">Built-in</span>`);
    if (exercise.builtIn === false) tags.push(`<span class="exo-tag exo-tag-kind exo-tag-custom">Custom</span>`);

    const cues = (exercise.cues || "").split("\n").map(s => s.trim()).filter(Boolean);
    const cuesHtml = cues.length
        ? `<ul class="exo-cues">${cues.map(c => `<li>${escapeHtml(c)}</li>`).join("")}</ul>`
        : `<p class="exo-empty">No cues yet.</p>`;

    return `
        <div class="exo-tags">${tags.join("")}</div>
        <section class="exo-section">
            <h3 class="exo-heading">Cues</h3>
            ${cuesHtml}
        </section>
        <section class="exo-section exo-facts">
            <div class="exo-fact">
                <span class="exo-fact-label">Muscles</span>
                <span class="exo-fact-value">${exercise.primaryMuscleGroups ? escapeHtml(exercise.primaryMuscleGroups) : `<span class="exo-empty">None</span>`}</span>
            </div>
            ${loggedAsHtml(exercise)}
            <div class="exo-fact">
                <span class="exo-fact-label">Unilateral</span>
                <span class="exo-fact-value">${exercise.unilateral === true ? "Yes" : "No"}</span>
            </div>
        </section>
        ${exercise.notes ? `
        <section class="exo-section">
            <h3 class="exo-heading">My notes</h3>
            <p class="exo-notes">${escapeHtml(exercise.notes)}</p>
        </section>` : ""}
    `;
}

/* "Weight & reps", or "Weight & reps" with "Time after your current
   workout" under it while a change waits for the open workout to end.
   Past sessions' copies without a type show nothing. */
function loggedAsHtml(exercise) {
    if (!exercise.logType) return "";
    const pending = exercise.pendingLogType
        ? `<span class="exo-pending">${logTypeLabel(exercise.pendingLogType)} after your current workout</span>`
        : "";
    return `
            <div class="exo-fact">
                <span class="exo-fact-label">Logged as</span>
                <span class="exo-fact-value">${logTypeLabel(exercise.logType)}${pending}</span>
            </div>`;
}
