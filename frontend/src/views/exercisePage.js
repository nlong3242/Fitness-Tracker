import { deleteExercise } from "../api.js";
import { createMoreButton } from "../components/actionMenu.js";
import { clearNavGuard } from "../components/bottomNav.js";
import { renderExerciseHistory } from "../components/exerciseHistory.js";
import { exerciseOverviewHtml } from "../components/exerciseOverview.js";
import { showConfirmModal } from "../components/modals.js";
import { escapeHtml } from "../utils/format.js";
import { setRoute } from "../router.js";
import { editExercise } from "./exerciseEdit.js";

/* An exercise's page, opened from the Exercises tab or a workout's page:
   read-only, with Overview (cues and details) and History tabs. From the
   Exercises tab, its ⋮ has Edit (the edit page, editExercise) and, for a
   Custom exercise, Delete; from a workout, those are in the workout
   page's ⋮ menu (Edit, Remove), so there's no ⋮ here.

   opts:
     routeFor(id) - this page's hash route for an exercise id (router.js);
                    "/history" is added for the History tab
     tab          - "overview" (default) or "history"
     onBack()     - back to where it was opened from
     workout      - { id, name } when opened from a workout's page
     onDone()     - the edit page's way back, if not this page (see
                    renderExerciseEditPage) */
export function renderExercisePage(exercise, opts) {
    clearNavGuard();
    let tab = opts.tab === "history" ? "history" : "overview";
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <div class="page-actions page-top">
            <button class="btn-secondary" id="exp-back-btn">Back</button>
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

    if (!opts.workout) {
        container.querySelector(".page-top").appendChild(createMoreButton(`Options for ${exercise.name}`, function() {
            return exerciseMenu(exercise, opts);
        }));
    }
}

// Built-ins can't be deleted (Edit offers a Custom copy instead).
function exerciseMenu(exercise, opts) {
    return [
        { label: "Edit exercise", onSelect: function() { editExercise(exercise, { ...opts, tab: "overview" }); } },
        ...(exercise.builtIn ? [] : [{ label: "Delete exercise", danger: true, onSelect: function() { removeExercise(exercise, opts); } }])
    ];
}

async function removeExercise(exercise, opts) {
    if (!(await showConfirmModal(`Delete "${exercise.name}" permanently?`, "Delete"))) return;
    await deleteExercise(exercise.id);
    opts.onBack();
}
