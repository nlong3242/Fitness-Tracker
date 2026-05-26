import { state } from "./state.js";
import { fetchWorkouts } from "./api.js";
import { renderBottomNav, setActiveTab } from "./components/bottomNav.js";

async function bootstrap() {
    state.workouts = await fetchWorkouts();
    renderBottomNav();
    setActiveTab("home");
}

bootstrap();
