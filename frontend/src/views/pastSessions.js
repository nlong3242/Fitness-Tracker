import { state, findWorkout, clearCurrentSession } from "../state.js";
import { fetchSessionsPage, deleteSession } from "../api.js";
import { formatSessionDate, escapeHtml } from "../utils/format.js";
import { clearNavGuard } from "../components/bottomNav.js";
import { showConfirmModal } from "../components/modals.js";
import { createMoreButton } from "../components/actionMenu.js";
import { viewWorkout } from "./workoutDetail.js";
import { viewSessionSummary } from "./summary.js";
import { setRoute } from "../router.js";

// onBack: where Back goes (default the workout's page; the workout list's
// ⋮ passes its own).
export async function viewPastSessions(workoutId, onBack) {
    clearNavGuard();
    const back = onBack || function() { viewWorkout(workoutId); };
    const workout = findWorkout(workoutId);
    setRoute(`#/workouts/${workoutId}/sessions`);

    const container = document.getElementById("app-content");
    container.innerHTML = `
        <div class="page-actions page-top">
            <button class="btn-secondary" id="past-sessions-back-btn">Back</button>
        </div>
        <h2 class="page-title">${escapeHtml(workout.name)} History</h2>
        <div id="session-list"></div>
        <button id="load-more-sessions" style="display:none">Load More</button>
    `;

    document.getElementById("past-sessions-back-btn").onclick = back;

    let nextPage = 0;
    let sessionIndex = 1;
    const loadMoreBtn = document.getElementById("load-more-sessions");
    const sessionList = document.getElementById("session-list");

    async function loadSessionPage() {
        const pageData = await fetchSessionsPage(workout.id, nextPage, 5);
        if (nextPage === 0 && pageData.content.length === 0) {
            sessionList.innerHTML = `<div class="empty-sessions">No previous sessions yet.</div>`;
            return;
        }
        for (const session of pageData.content) {
            const row = document.createElement("div");
            row.className = "session-row";
            row.innerHTML = `<span class="session-index">${sessionIndex}.</span> ${formatSessionDate(session.date)}`;
            row.onclick = function() {
                viewSessionSummary(workoutId, session.id, session.date, function() { viewPastSessions(workoutId, back); });
            };

            row.appendChild(createMoreButton(`Options for the session from ${formatSessionDate(session.date)}`, function() {
                return [{ label: "Delete session", danger: true, onSelect: function() { removeSession(session); } }];
            }));

            sessionList.appendChild(row);
            sessionIndex++;
        }
        nextPage++;
        loadMoreBtn.style.display = pageData.last ? "none" : "inline-block";
    }

    async function removeSession(session) {
        const confirmed = await showConfirmModal(
            `Delete the session from ${formatSessionDate(session.date)}? Its sets are removed permanently.`,
            "Delete"
        );
        if (!confirmed) return;
        await deleteSession(session.id);
        if (state.currentSessionId === session.id) clearCurrentSession();
        viewPastSessions(workoutId, back);
    }

    loadMoreBtn.onclick = loadSessionPage;
    await loadSessionPage();
}
