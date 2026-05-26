import { state } from "./state.js";
import { fetchWorkouts } from "./api.js";
import { renderLandingPage } from "./views/landing.js";

async function bootstrap() {
    state.workouts = await fetchWorkouts();
    renderLandingPage();
}

bootstrap();
