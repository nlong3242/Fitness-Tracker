import { state } from "../state.js";
import { fetchSessionsPage } from "../api.js";
import { formatSessionDate } from "../utils/format.js";
import { viewWorkout } from "./workoutDetail.js";
import { viewSessionSummary } from "./summary.js";

export async function viewPastSessions(workoutIndex) {
    const workout = state.workouts[workoutIndex];

    const container = document.getElementById("container");
    container.innerHTML = `
        <h2>${workout.name} History</h2>
        <div id="session-list"></div>
        <button id="load-more-sessions" style="display:none">Load More</button>
        <div class="page-actions">
            <button class="btn-secondary" id="past-sessions-back-btn">Back</button>
        </div>
    `;

    document.getElementById("past-sessions-back-btn").onclick = function() { viewWorkout(workoutIndex); };

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
                viewSessionSummary(workoutIndex, session.id, session.date, function() { viewPastSessions(workoutIndex); });
            };
            sessionList.appendChild(row);
            sessionIndex++;
        }
        nextPage++;
        loadMoreBtn.style.display = pageData.last ? "none" : "inline-block";
    }

    loadMoreBtn.onclick = loadSessionPage;
    await loadSessionPage();
}
