import { clearNavGuard } from "../components/bottomNav.js";
import { renderExerciseHistory } from "../components/exerciseHistory.js";
import { exerciseOverviewHtml } from "../components/exerciseOverview.js";
import { escapeHtml } from "../utils/format.js";
import { setRoute } from "../router.js";
import { editExercise } from "./exerciseEdit.js";

/* An exercise's page, opened from the Exercises tab or a workout's page:
   read-only, with Overview (cues and details) and History tabs. From the
   Exercises tab, Edit opens the edit page (editExercise); from a workout,
   editing is in the workout page's ⋮ menu, so there's no Edit here.

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
        <div class="page-actions exp-actions">
            <button class="btn-secondary" id="exp-back-btn">Back</button>
            ${opts.workout ? "" : `<button id="exp-edit-btn">Edit</button>`}
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

    // Edit is a page of its own (exerciseEdit.js). From a workout it's in
    // the workout page's ⋮ menu instead.
    const editBtn = document.getElementById("exp-edit-btn");
    if (editBtn) editBtn.onclick = function() { editExercise(exercise, { ...opts, tab: "overview" }); };
}
