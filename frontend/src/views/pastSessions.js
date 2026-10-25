import { state, findWorkout, clearCurrentSession } from "../state.js";
import { fetchSessionsPage, deleteSession } from "../api.js";
import { formatSessionDate, escapeHtml } from "../utils/format.js";
import { clearNavGuard } from "../components/bottomNav.js";
import { showConfirmModal } from "../components/modals.js";
import { viewWorkout } from "./workoutDetail.js";
import { viewSessionSummary } from "./summary.js";
import { setRoute } from "../router.js";

export async function viewPastSessions(workoutId) {
    clearNavGuard();
    const workout = findWorkout(workoutId);
    setRoute(`#/workouts/${workoutId}/sessions`);

    const container = document.getElementById("app-content");
    container.innerHTML = `
        <h2>${escapeHtml(workout.name)} History</h2>
        <div id="session-list"></div>
        <button id="load-more-sessions" style="display:none">Load More</button>
        <div class="page-actions">
            <button class="btn-secondary" id="past-sessions-back-btn">Back</button>
        </div>
    `;

    document.getElementById("past-sessions-back-btn").onclick = function() { viewWorkout(workoutId); };

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
                viewSessionSummary(workoutId, session.id, session.date, function() { viewPastSessions(workoutId); });
            };

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "btn-danger session-delete-btn";
            deleteBtn.textContent = "Delete";
            deleteBtn.onclick = async function(event) {
                event.stopPropagation();
                const confirmed = await showConfirmModal(
                    `Delete the session from ${formatSessionDate(session.date)}? Its sets are removed permanently.`,
                    "Delete"
                );
                if (!confirmed) return;
                await deleteSession(session.id);
                if (state.currentSessionId === session.id) clearCurrentSession();
                viewPastSessions(workoutId);
            };
            row.appendChild(deleteBtn);

            sessionList.appendChild(row);
            sessionIndex++;
        }
        nextPage++;
        loadMoreBtn.style.display = pageData.last ? "none" : "inline-block";
    }

    loadMoreBtn.onclick = loadSessionPage;
    await loadSessionPage();
}
