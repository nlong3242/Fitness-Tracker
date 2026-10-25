import { clearNavGuard } from "../components/bottomNav.js";
import { renderExerciseHistory } from "../components/exerciseHistory.js";
import { exerciseOverviewHtml } from "../components/exerciseOverview.js";
import { showConfirmModal, showExerciseDetailsModal } from "../components/modals.js";
import {
    copyExercise,
    deleteExercise,
    fetchExercise,
    removeWorkoutExercise,
    updateExercise,
    updateWorkoutExercise
} from "../api.js";
import { escapeHtml } from "../utils/format.js";
import { setRoute } from "../router.js";

/* An exercise's page, opened from the Exercises tab or a workout's page:
   read-only, with Overview (cues and details) and History tabs. Edit opens
   the edit popup. A built-in exercise can't be changed, so Edit first
   offers a Custom copy (which takes over the user's workouts and history
   for it, see ExerciseService.copyBuiltIn) and edits that.

   opts:
     routeFor(id) - this page's hash route for an exercise id (router.js);
                    "/history" is added for the History tab
     tab          - "overview" (default) or "history"
     onBack()     - back to where it was opened from
     workout      - { id, name } when opened from a workout's page: changes
                    go through the workout, and Delete becomes Remove (from
                    the workout). A built-in one gets Remove on the page. */
export function renderExercisePage(exercise, opts) {
    clearNavGuard();
    let tab = opts.tab === "history" ? "history" : "overview";
    const workout = opts.workout || null;
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <div class="page-actions exp-actions">
            <button class="btn-secondary" id="exp-back-btn">Back</button>
            ${workout && exercise.builtIn ? `<button class="btn-secondary" id="exp-remove-btn">Remove</button>` : ""}
            <button id="exp-edit-btn">Edit</button>
        </div>
        <h2 class="exh-page-title">${escapeHtml(exercise.name)}</h2>
        <div class="exp-tabs" role="tablist">
            <button type="button" class="filter-pill" data-tab="overview" role="tab">Overview</button>
            <button type="button" class="filter-pill" data-tab="history" role="tab">History</button>
        </div>
        <div class="exh-page-panel" id="exp-body"></div>
    `;
    document.getElementById("app-scroll").scrollTo(0, 0);

    function showTab(next) {
        tab = next;
        setRoute(opts.routeFor(exercise.id) + (tab === "history" ? "/history" : ""));
        for (const b of container.querySelectorAll(".exp-tabs .filter-pill")) {
            const on = b.dataset.tab === tab;
            b.classList.toggle("selected", on);
            b.setAttribute("aria-selected", String(on));
        }
        const body = document.getElementById("exp-body");
        if (tab === "history") {
            renderExerciseHistory(body, exercise.id);
        } else {
            body.innerHTML = exerciseOverviewHtml(exercise);
        }
    }
    for (const b of container.querySelectorAll(".exp-tabs .filter-pill")) {
        b.onclick = function() { showTab(b.dataset.tab); };
    }
    showTab(tab);

    document.getElementById("exp-back-btn").onclick = function() { opts.onBack(); };

    const removeBtn = document.getElementById("exp-remove-btn");
    if (removeBtn) {
        removeBtn.onclick = async function() {
            if (!(await showConfirmModal(`Remove "${exercise.name}" from "${workout.name}"?`, "Remove"))) return;
            await removeWorkoutExercise(workout.id, exercise.id);
            opts.onBack();
        };
    }

    document.getElementById("exp-edit-btn").onclick = async function() {
        let target = exercise;
        if (exercise.builtIn) {
            const ok = await showConfirmModal(
                "Built-in exercises can't be changed. Make a Custom copy you can edit? "
                + "Your workouts and history for it will move to the copy.",
                "Make a copy");
            if (!ok) return;
            try {
                target = await copyExercise(exercise.id);
            } catch (e) {
                await showConfirmModal("Couldn't make the copy. Check your connection and try again.", "OK");
                return;
            }
            // The copy is the one in use now: show it, then edit it.
            renderExercisePage(target, { ...opts, tab });
        }

        const result = await showExerciseDetailsModal(target, workout
            ? { deleteLabel: "Remove", deleteConfirmMessage: `Remove "${target.name}" from "${workout.name}"?` }
            : { deleteLabel: "Delete", deleteConfirmMessage: `Delete "${target.name}" permanently?` });
        if (!result) return;
        if (result.action === "save") {
            if (workout) await updateWorkoutExercise(workout.id, target.id, result.data);
            else await updateExercise(target.id, result.data);
            let saved;
            try {
                saved = await fetchExercise(target.id);
            } catch (e) {
                saved = { ...target, ...result.data };
            }
            renderExercisePage(saved, { ...opts, tab });
        } else if (result.action === "delete") {
            if (workout) await removeWorkoutExercise(workout.id, target.id);
            else await deleteExercise(target.id);
            opts.onBack();
        }
    };
}
