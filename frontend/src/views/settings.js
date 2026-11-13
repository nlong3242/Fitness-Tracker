import { setActiveTab, clearNavGuard } from "../components/bottomNav.js";
import { showConfirmModal } from "../components/modals.js";
import { setRoute } from "../router.js";
import { fetchMe, logout, logoutEverywhere, changePassword, saveRestSeconds, saveShowWorkoutTimer } from "../api.js";
import {
    getRestSeconds, formatRest, QUICK_TIMES, STEP_SECONDS, MIN_REST_SECONDS, MAX_REST_SECONDS
} from "../components/restTimer.js";
import { showWorkoutTimer } from "../components/workoutStopwatch.js";
import { clearToken } from "../auth.js";
import { state } from "../state.js";
import { renderProfilePage } from "./profile.js";

/* Settings — opened from the gear on Home: who's logged in, Profile,
   Timers, Change password, Log out, and Log out everywhere. */

// Kept on this device for whoever is logged in; the next account mustn't
// inherit them (see router.js, drafts.js, session.js).
const ACCOUNT_KEYS = ["fitness.lastRoute", "fitness.setDrafts", "fitness.startedWorkout"];

// notice: a line to show once, e.g. after changing the password.
export async function renderSettingsPage(notice = "") {
    clearNavGuard();
    setRoute("#/settings");
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <div class="page-actions page-top">
            <button class="btn-secondary" id="settings-back-btn">Back</button>
        </div>
        <h2 class="page-title">Settings</h2>
        <p class="settings-notice" id="settings-notice" role="status" hidden></p>
        <div class="settings-panel">
            <span class="settings-label">Logged in as</span>
            <span class="settings-name" id="settings-name" hidden></span>
            <span class="settings-email" id="settings-email">…</span>
        </div>
        <div class="settings-actions">
            <button class="btn-secondary" id="settings-profile-btn">Profile</button>
            <button class="btn-secondary" id="settings-rest-btn">Timers</button>
            <button class="btn-secondary" id="settings-password-btn">Change password</button>
            <button class="btn-danger" id="settings-logout-btn">Log out</button>
            <button class="btn-danger" id="settings-logout-all-btn">Log out everywhere</button>
        </div>
    `;
    showNotice(notice);
    if (state.profile) {
        const name = document.getElementById("settings-name");
        name.textContent = state.profile.name;
        name.hidden = false;
    }
    document.getElementById("settings-back-btn").onclick = function() { setActiveTab("home"); };
    document.getElementById("settings-profile-btn").onclick = function() { renderProfilePage(); };
    document.getElementById("settings-password-btn").onclick = function() { renderChangePasswordPage(); };
    document.getElementById("settings-logout-btn").onclick = logOut;
    document.getElementById("settings-logout-all-btn").onclick = logOutEverywhere;
    document.getElementById("settings-rest-btn").onclick = function() { renderRestTimerPage(); };

    try {
        const me = await fetchMe();
        const email = document.getElementById("settings-email");
        if (email) email.textContent = me.email;
    } catch (e) {
        const email = document.getElementById("settings-email");
        if (email) email.textContent = "Unavailable";
    }
}

/* Timers page (Settings → Timers), both saved with the account:
   - Workout stopwatch: on / off. A tap saves at once; if the save fails
     the switch goes back.
   - Rest between sets. The 8 quick times pick one; − / + adjust it in 15 s
     steps (0:15 to 10:00). Each change shows at once and saves shortly
     after the last tap, so tapping + four times is one save.
   Needs the profile they're saved on; if that couldn't be loaded (offline
   start), it says so. The route stays #/settings/rest (the page's old
   name) so saved links and the last-route restore keep working. */
const REST_SAVE_DELAY_MS = 600;

export function renderRestTimerPage() {
    clearNavGuard();
    setRoute("#/settings/rest");
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <div class="page-actions page-top">
            <button class="btn-secondary" id="rest-back-btn">Back</button>
        </div>
        <h2 class="page-title">Timers</h2>
        <div class="settings-panel" id="stopwatch-settings">
            <div class="settings-switch-row">
                <span class="settings-switch-label" id="stopwatch-switch-label">Workout stopwatch</span>
                <button type="button" class="settings-switch" id="stopwatch-switch" role="switch"
                        aria-checked="true" aria-labelledby="stopwatch-switch-label">
                    <span class="settings-switch-knob"></span>
                </button>
            </div>
            <span class="rest-settings-status" id="stopwatch-status" role="status"></span>
        </div>
        <p class="settings-hint">Shows how long the workout has taken, next to its name. The
            time is saved with each workout either way.</p>
        <div class="settings-panel rest-settings" id="rest-settings">
            <span class="settings-label">Rest between sets</span>
            <div class="rest-settings-row">
                <button type="button" class="btn-secondary rest-settings-step" id="rest-settings-minus"
                        aria-label="15 seconds less">−</button>
                <span class="rest-settings-value" id="rest-settings-value" aria-live="polite"></span>
                <button type="button" class="btn-secondary rest-settings-step" id="rest-settings-plus"
                        aria-label="15 seconds more">+</button>
            </div>
            <div class="rest-timer-chips" id="rest-settings-chips"></div>
            <span class="rest-settings-status" id="rest-settings-status" role="status"></span>
        </div>
        <p class="settings-hint">Logging a set starts a rest this long. A quick time in the
            workout's timer changes just that rest.</p>
    `;
    document.getElementById("rest-back-btn").onclick = function() { renderSettingsPage(); };
    if (!state.profile) {
        for (const id of ["stopwatch-settings", "rest-settings"]) {
            document.getElementById(id).innerHTML =
                `<span class="rest-settings-status error">Couldn't load your settings. Check your connection and try again.</span>`;
        }
        return;
    }
    setUpStopwatchSetting();
    setUpRestSettings();
}

function setUpStopwatchSetting() {
    const toggle = document.getElementById("stopwatch-switch");
    const status = document.getElementById("stopwatch-status");
    let saving = false;

    function draw(on) {
        toggle.setAttribute("aria-checked", String(on));
    }

    function setStatus(text, isError = false) {
        status.textContent = text;
        status.classList.toggle("error", isError);
    }

    toggle.onclick = async function() {
        if (saving) return;
        const on = toggle.getAttribute("aria-checked") !== "true";
        draw(on);
        setStatus("");
        saving = true;
        try {
            const profile = await saveShowWorkoutTimer(on);
            if (state.profile) state.profile.showWorkoutTimer = profile.showWorkoutTimer;
            if (status.isConnected) setStatus("Saved");
        } catch (e) {
            draw(!on);
            if (status.isConnected) setStatus("Couldn't save. Check your connection and try again.", true);
        } finally {
            saving = false;
        }
    };
    draw(showWorkoutTimer());
}

function setUpRestSettings() {
    const value = document.getElementById("rest-settings-value");
    const minus = document.getElementById("rest-settings-minus");
    const plus = document.getElementById("rest-settings-plus");
    const chips = document.getElementById("rest-settings-chips");
    const status = document.getElementById("rest-settings-status");

    let saved = getRestSeconds();
    let shown = saved;
    let timer = null;

    chips.innerHTML = QUICK_TIMES.map(s => `
        <button type="button" class="rest-timer-chip" data-seconds="${s}">${formatRest(s)}</button>`).join("");

    function draw() {
        value.textContent = formatRest(shown);
        minus.disabled = shown <= MIN_REST_SECONDS;
        plus.disabled = shown >= MAX_REST_SECONDS;
        chips.querySelectorAll(".rest-timer-chip").forEach(chip => {
            chip.classList.toggle("mine", Number(chip.dataset.seconds) === shown);
        });
    }

    function setStatus(text, isError = false) {
        status.textContent = text;
        status.classList.toggle("error", isError);
    }

    function choose(seconds) {
        shown = Math.min(MAX_REST_SECONDS, Math.max(MIN_REST_SECONDS, seconds));
        draw();
        setStatus("");
        clearTimeout(timer);
        timer = setTimeout(save, REST_SAVE_DELAY_MS);
    }

    async function save() {
        if (shown === saved) return;
        const seconds = shown;
        try {
            const profile = await saveRestSeconds(seconds);
            saved = profile.restSeconds;
            if (state.profile) state.profile.restSeconds = saved;
            getRestSeconds(); // keeps the offline copy in step
            if (document.getElementById("rest-settings-status") === status && shown === seconds) setStatus("Saved");
        } catch (e) {
            // Back to what the account has, so the screen never shows a
            // time the timer won't use.
            shown = saved;
            draw();
            setStatus("Couldn't save. Check your connection and try again.", true);
        }
    }

    minus.onclick = function() { choose(shown - STEP_SECONDS); };
    plus.onclick = function() { choose(shown + STEP_SECONDS); };
    chips.querySelectorAll(".rest-timer-chip").forEach(chip => {
        chip.onclick = function() { choose(Number(chip.dataset.seconds)); };
    });
    draw();
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

/* Current password, then the new one twice, each with a Show/Hide (the
   same parts as the login page, styles/pages/auth.css). On success
   other devices are logged out and this one carries on. */
export function renderChangePasswordPage() {
    clearNavGuard();
    setRoute("#/settings/password");
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <div class="page-actions page-top">
            <button class="btn-secondary" id="password-back-btn">Back</button>
        </div>
        <h2 class="page-title">Change password</h2>
        <form class="auth-panel" id="password-form" novalidate>
            <input type="email" id="password-username" autocomplete="username" hidden>
            <div class="auth-field">
                <label class="auth-label" for="password-current">Current password</label>
                <div class="auth-password-row">
                    <input id="password-current" type="password" autocomplete="current-password">
                    <button type="button" class="btn-secondary auth-show" id="password-show"
                            aria-controls="password-current"></button>
                </div>
            </div>
            <div class="auth-field">
                <label class="auth-label" for="password-new">New password</label>
                <div class="auth-password-row">
                    <input id="password-new" type="password" autocomplete="new-password">
                    <button type="button" class="btn-secondary auth-show" id="password-show-new"
                            aria-controls="password-new password-confirm"></button>
                </div>
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
    const showNew = document.getElementById("password-show-new");
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

    // Each Show/Hide covers its own field; the new password's also covers
    // its confirmation, as on the sign-up page.
    function setShown(button, fields, shown, what) {
        for (const field of fields) field.type = shown ? "text" : "password";
        button.textContent = shown ? "Hide" : "Show";
        button.setAttribute("aria-pressed", String(shown));
        button.setAttribute("aria-label", (shown ? "Hide " : "Show ") + what);
    }

    function setPasswordsShown(shown) {
        setShown(show, [current], shown, "current password");
        setShown(showNew, [next, confirm], shown, "new password");
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
    show.onclick = function() { setShown(show, [current], current.type === "password", "current password"); };
    showNew.onmousedown = function(e) { e.preventDefault(); };
    showNew.onclick = function() { setShown(showNew, [next, confirm], next.type === "password", "new password"); };

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
