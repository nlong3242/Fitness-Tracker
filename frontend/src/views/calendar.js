import { clearNavGuard } from "../components/bottomNav.js";

export function renderCalendarPage() {
    clearNavGuard();
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <div class="calendar-placeholder">
            <h2>Calendar</h2>
            <p>Month view coming next — schedule workouts onto specific days.</p>
        </div>
    `;
}
