import { setActiveTab, clearNavGuard } from "../components/bottomNav.js";

export function renderHomePage() {
    clearNavGuard();
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <div class="home-hero">
            <h2 class="home-title">Welcome to Tsu2Track</h2>
            <p class="home-tagline">Your personal fitness companion</p>
        </div>

        <button class="home-cta" id="home-start-btn">Start a Workout</button>

        <div class="home-stat-row">
            <div class="home-stat">
                <div class="home-stat-value">12</div>
                <div class="home-stat-label">Sessions this week</div>
            </div>
            <div class="home-stat">
                <div class="home-stat-value">Push Day</div>
                <div class="home-stat-label">Last session · 2d ago</div>
            </div>
        </div>
    `;

    document.getElementById("home-start-btn").onclick = function() { setActiveTab("workouts"); };
}
