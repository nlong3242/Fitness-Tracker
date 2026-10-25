import { setActiveTab, clearNavGuard } from "../components/bottomNav.js";
import { setRoute } from "../router.js";
import { fetchMe, logout } from "../api.js";
import { clearToken } from "../auth.js";

/* Settings — opened from the gear on Home. For now: who's logged in, and
   Log out. */

// Kept on this device for whoever is logged in; the next account mustn't
// inherit them (see router.js, drafts.js, session.js).
const ACCOUNT_KEYS = ["fitness.lastRoute", "fitness.setDrafts", "fitness.startedWorkout"];

export async function renderSettingsPage() {
    clearNavGuard();
    setRoute("#/settings");
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <h2>Settings</h2>
        <div class="page-actions">
            <button class="btn-secondary" id="settings-back-btn">Back</button>
        </div>
        <div class="settings-panel">
            <span class="settings-label">Logged in as</span>
            <span class="settings-email" id="settings-email">…</span>
        </div>
        <button class="btn-danger settings-logout" id="settings-logout-btn">Log out</button>
    `;
    document.getElementById("settings-back-btn").onclick = function() { setActiveTab("home"); };
    document.getElementById("settings-logout-btn").onclick = logOut;

    try {
        const me = await fetchMe();
        const email = document.getElementById("settings-email");
        if (email) email.textContent = me.email;
    } catch (e) {
        const email = document.getElementById("settings-email");
        if (email) email.textContent = "Unavailable";
    }
}

async function logOut() {
    const button = document.getElementById("settings-logout-btn");
    button.disabled = true;
    // Logged out on this device even if the server can't be reached; the
    // token then just lapses unused.
    try { await logout(); } catch (e) { /* offline */ }
    clearToken();
    for (const key of ACCOUNT_KEYS) {
        try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    }
    // A fresh start with no token opens the login page, with nothing of
    // this account left in memory.
    history.replaceState(null, "", location.pathname);
    location.reload();
}
