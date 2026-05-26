import { renderWorkouts } from "./workouts.js";
import { renderExerciseLibrary } from "./library.js";

export function renderLandingPage() {
    const container = document.getElementById("container");
    container.innerHTML = `
        <div class="landing-hero">
            <h2 class="landing-title">Welcome to Tsu2Track</h2>
            <p class="landing-tagline">Your personal fitness companion</p>
        </div>
        <div class="landing-card-grid">
            <div class="landing-card" id="landing-workouts-card">
                <div class="landing-card-title">Workouts</div>
                <div class="landing-card-desc">View and start your routines</div>
            </div>
            <div class="landing-card" id="landing-library-card">
                <div class="landing-card-title">Exercise Library</div>
                <div class="landing-card-desc">Browse and manage exercises</div>
            </div>
        </div>
    `;
    document.getElementById("landing-workouts-card").onclick = renderWorkouts;
    document.getElementById("landing-library-card").onclick = function() { renderExerciseLibrary(); };
}
