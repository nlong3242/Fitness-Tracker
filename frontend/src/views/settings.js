import { setActiveTab, clearNavGuard } from "../components/bottomNav.js";
import { showConfirmModal } from "../components/modals.js";
import { setRoute } from "../router.js";
import { fetchMe, logout, logoutEverywhere, changePassword } from "../api.js";
import { clearToken } from "../auth.js";

/* Settings — opened from the gear on Home: who's logged in, Change
   password, Log out, and Log out everywhere. */

// Kept on this device for whoever is logged in; the next account mustn't
// inherit them (see router.js, drafts.js, session.js).
const ACCOUNT_KEYS = ["fitness.lastRoute", "fitness.setDrafts", "fitness.startedWorkout"];

// notice: a line to show once, e.g. after changing the password.
export async function renderSettingsPage(notice = "") {
    clearNavGuard();
    setRoute("#/settings");
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <h2>Settings</h2>
        <div class="page-actions">
            <button class="btn-secondary" id="settings-back-btn">Back</button>
        </div>
        <p class="settings-notice" id="settings-notice" role="status" hidden></p>
        <div class="settings-panel">
            <span class="settings-label">Logged in as</span>
            <span class="settings-email" id="settings-email">…</span>
        </div>
        <div class="settings-actions">
            <button class="btn-secondary" id="settings-password-btn">Change password</button>
            <button class="btn-danger" id="settings-logout-btn">Log out</button>
            <button class="btn-danger" id="settings-logout-all-btn">Log out everywhere</button>
        </div>
    `;
    showNotice(notice);
    document.getElementById("settings-back-btn").onclick = function() { setActiveTab("home"); };
    document.getElementById("settings-password-btn").onclick = function() { renderChangePasswordPage(); };
    document.getElementById("settings-logout-btn").onclick = logOut;
    document.getElementById("settings-logout-all-btn").onclick = logOutEverywhere;

    try {
        const me = await fetchMe();
        const email = document.getElementById("settings-email");
        if (email) email.textContent = me.email;
    } catch (e) {
        const email = document.getElementById("settings-email");
        if (email) email.textContent = "Unavailable";
    }
}

function showNotice(message, isError = false) {
    const notice = document.getElementById("settings-notice");
    if (!notice) return;
    notice.textContent = message;
    notice.hidden = !message;
    notice.classList.toggle("error", isError);
}

async function logOut() {
    document.getElementById("settings-logout-btn").disabled = true;
    // Logged out on this device even if the server can't be reached; the
    // token then just lapses unused.
    try { await logout(); } catch (e) { /* offline */ }
    endLoginOnThisDevice();
}

// Unlike Log out, this must reach the server: it's what ends the logins on
// the other devices.
async function logOutEverywhere() {
    const confirmed = await showConfirmModal(
        "Log out on all devices? You'll need to log in again on each one.", "Log out everywhere");
    if (!confirmed) return;
    const button = document.getElementById("settings-logout-all-btn");
    button.disabled = true;
    try {
        await logoutEverywhere();
    } catch (e) {
        button.disabled = false;
        showNotice("Unable to log out everywhere. Check your connection and try again.", true);
        return;
    }
    endLoginOnThisDevice();
}

function endLoginOnThisDevice() {
    clearToken();
    for (const key of ACCOUNT_KEYS) {
        try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    }
    // A fresh start with no token opens the login page, with nothing of
    // this account left in memory.
    history.replaceState(null, "", location.pathname);
    location.reload();
}

/* Current password, then the new one twice, with one Show/Hide for all
   three (same parts as the login page, styles/pages/auth.css). On success
   other devices are logged out and this one carries on. */
export function renderChangePasswordPage() {
    clearNavGuard();
    setRoute("#/settings/password");
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <h2>Change password</h2>
        <div class="page-actions">
            <button class="btn-secondary" id="password-back-btn">Back</button>
        </div>
        <form class="auth-panel" id="password-form" novalidate>
            <input type="email" id="password-username" autocomplete="username" hidden>
            <div class="auth-field">
                <label class="auth-label" for="password-current">Current password</label>
                <div class="auth-password-row">
                    <input id="password-current" type="password" autocomplete="current-password">
                    <button type="button" class="btn-secondary auth-show" id="password-show"
                            aria-controls="password-current password-new password-confirm"></button>
                </div>
            </div>
            <div class="auth-field">
                <label class="auth-label" for="password-new">New password</label>
                <input id="password-new" type="password" autocomplete="new-password">
                <span class="auth-hint">At least 8 characters. Other devices will be logged out.</span>
            </div>
            <div class="auth-field">
                <label class="auth-label" for="password-confirm">Confirm new password</label>
                <input id="password-confirm" type="password" autocomplete="new-password">
            </div>
            <p class="auth-error" id="password-error" role="alert" hidden></p>
            <button type="submit" class="auth-submit" id="password-submit">Change password</button>
        </form>
    `;
    const form = document.getElementById("password-form");
    const current = document.getElementById("password-current");
    const next = document.getElementById("password-new");
    const confirm = document.getElementById("password-confirm");
    const show = document.getElementById("password-show");
    const error = document.getElementById("password-error");
    const submit = document.getElementById("password-submit");

    document.getElementById("password-back-btn").onclick = function() { renderSettingsPage(); };

    // Lets iOS update the saved password for this account.
    fetchMe().then(function(me) {
        const username = document.getElementById("password-username");
        if (username) username.value = me.email;
    }).catch(function() { /* only the password manager misses out */ });

    function showError(message) {
        error.textContent = message;
        error.hidden = !message;
    }

    function setPasswordsShown(shown) {
        for (const field of [current, next, confirm]) field.type = shown ? "text" : "password";
        show.textContent = shown ? "Hide" : "Show";
        show.setAttribute("aria-pressed", String(shown));
        show.setAttribute("aria-label", shown ? "Hide passwords" : "Show passwords");
    }

    // What to tell the user, in the order they'd fix it.
    function problem() {
        if (!current.value) return "Current password is required.";
        if (!next.value) return "New password is required.";
        if (next.value.length < 8) return "Password must be at least 8 characters.";
        if (!confirm.value) return "Password confirmation is required.";
        if (confirm.value !== next.value) return "Passwords do not match.";
        return "";
    }

    // Tapping Show mustn't take focus from the field being typed in.
    show.onmousedown = function(e) { e.preventDefault(); };
    show.onclick = function() { setPasswordsShown(current.type === "password"); };

    form.onsubmit = async function(e) {
        e.preventDefault();
        // Back to dots first: iOS offers to save only from password fields.
        setPasswordsShown(false);
        const message = problem();
        if (message) {
            showError(message);
            return;
        }
        showError("");
        submit.disabled = true;
        try {
            const result = await changePassword(current.value, next.value);
            if (!result.ok) {
                showError(serverMessage(result));
                return;
            }
            renderSettingsPage("Password changed. Other devices have been logged out.");
        } catch (err) {
            showError("Unable to connect to the server. Please try again.");
        } finally {
            submit.disabled = false;
        }
    };

    setPasswordsShown(false);
}

// The server's explanation, reworded where its validation text is technical.
function serverMessage(result) {
    const first = result.data && result.data.errors && result.data.errors[0];
    if (first && first.field === "newPassword" && result.status === 400) return "Password must be 8 to 72 characters.";
    if (first && first.message) return first.message;
    return "Something went wrong. Please try again.";
}
