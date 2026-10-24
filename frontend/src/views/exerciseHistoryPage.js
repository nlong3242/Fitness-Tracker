import { clearNavGuard } from "../components/bottomNav.js";
import { renderExerciseHistory } from "../components/exerciseHistory.js";
import { escapeHtml, formatCategoryLabel } from "../utils/format.js";

/* Full-page exercise history (PRs + past sessions), opened from an
   exercise's edit popup in the Exercises tab or on a workout's page.
   Same content as the live workout popup's History tab, with the whole
   page to scroll. onBack returns to wherever it was opened from. */
export function renderExerciseHistoryPage(exercise, onBack) {
    clearNavGuard();
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <h2 class="exh-page-title">${escapeHtml(exercise.name)}</h2>
        <div class="exh-page-sub">${escapeHtml(formatCategoryLabel(exercise.category))} · History</div>
        <div class="page-actions">
            <button class="btn-secondary" id="exh-back-btn">Back</button>
        </div>
        <div class="exh-page-panel" id="exh-page-body"></div>
    `;
    document.getElementById("exh-back-btn").onclick = onBack;
    document.getElementById("app-scroll").scrollTo(0, 0);
    renderExerciseHistory(document.getElementById("exh-page-body"), exercise.id);
}
