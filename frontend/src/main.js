import { state } from "./state.js";
import { fetchWorkouts } from "./api.js";
import { renderBottomNav, setActiveTab } from "./components/bottomNav.js";

// Mirror the visual viewport into CSS so modal overlays (modals.css) fit
// the area above the iOS keyboard instead of the full screen behind it.
function trackVisualViewport() {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement.style;
    const sync = () => {
        root.setProperty("--vv-height", `${vv.height}px`);
        root.setProperty("--vv-top", `${vv.offsetTop}px`);
    };
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    sync();
}

async function bootstrap() {
    trackVisualViewport();
    state.workouts = await fetchWorkouts();
    renderBottomNav();
    setActiveTab("home");
}

bootstrap();
