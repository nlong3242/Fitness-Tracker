import { clearNavGuard } from "../components/bottomNav.js";
import { setRoute } from "../router.js";
import { fetchProfile, saveProfile } from "../api.js";
import { state } from "../state.js";
import { renderSettingsPage } from "./settings.js";

/* The profile form, used two ways:
   - showProfileSetup(): once, when an account has no profile yet (right
     after sign-up, or an account from before profiles). A full-screen
     layer like the login page, with Save only: the name is required.
   - renderProfilePage(): edit it any time from Settings.
   Only the name is required; the rest can stay blank. */

const MAX_GOAL = 14;   // twice a day; the server checks the same

function formHtml(heading, intro, submitLabel) {
    return `
        <form class="auth-panel" id="profile-form" novalidate>
            ${heading ? `<h2 class="profile-heading">${heading}</h2>` : ""}
            ${intro ? `<p class="profile-intro">${intro}</p>` : ""}
            <label class="auth-field">
                <span class="auth-label">Name</span>
                <input id="profile-name" type="text" maxlength="40" autocomplete="nickname"
                       autocapitalize="words" spellcheck="false">
                <span class="auth-hint">What the app calls you.</span>
            </label>
            <label class="auth-field">
                <span class="auth-label">Date of birth <span class="profile-optional">(optional)</span></span>
                <input id="profile-birth" type="date">
            </label>
            <label class="auth-field">
                <span class="auth-label">Height <span class="profile-optional">(optional)</span></span>
                <span class="profile-unit-row">
                    <input id="profile-height" type="text" inputmode="numeric" autocomplete="off" maxlength="3">
                    <span class="profile-unit">cm</span>
                </span>
            </label>
            <div class="auth-field">
                <span class="auth-label" id="profile-goal-label">Weekly goal <span class="profile-optional">(optional)</span></span>
                <div class="profile-goal-row">
                    <button type="button" class="btn-secondary profile-goal-step" id="profile-goal-minus" aria-label="One fewer">−</button>
                    <input id="profile-goal" type="text" inputmode="numeric" autocomplete="off" maxlength="2"
                           placeholder="–" aria-labelledby="profile-goal-label">
                    <button type="button" class="btn-secondary profile-goal-step" id="profile-goal-plus" aria-label="One more">+</button>
                    <span class="profile-unit">a week</span>
                </div>
                <span class="auth-hint">Workouts per week, up to ${MAX_GOAL}. Leave empty for no goal.</span>
            </div>
            <p class="auth-error" id="profile-error" role="alert" hidden></p>
            <button type="submit" class="auth-submit" id="profile-submit">${submitLabel}</button>
        </form>
    `;
}

function localIso(date) {
    return date.toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
}

// Fills the form from `profile` (or leaves it blank) and saves on submit;
// onSaved gets the saved profile.
function wireForm(profile, onSaved) {
    const form = document.getElementById("profile-form");
    const name = document.getElementById("profile-name");
    const birth = document.getElementById("profile-birth");
    const height = document.getElementById("profile-height");
    const error = document.getElementById("profile-error");
    const submit = document.getElementById("profile-submit");
    const goal = document.getElementById("profile-goal");
    const minus = document.getElementById("profile-goal-minus");
    const plus = document.getElementById("profile-goal-plus");

    const today = new Date();
    const oldest = new Date(today.getFullYear() - 120, today.getMonth(), today.getDate());
    birth.max = localIso(today);
    birth.min = localIso(oldest);

    // Weekly goal: type it, or step it with − / +. − from 1 empties it (no
    // goal); + from empty starts at 1. Anything typed that isn't a number
    // counts as empty for stepping.
    function goalNumber() {
        const g = goal.value.trim();
        return /^\d+$/.test(g) ? Number(g) : null;
    }
    function updateSteps() {
        const n = goalNumber();
        minus.disabled = n === null;
        plus.disabled = n !== null && n >= MAX_GOAL;
    }
    function setGoal(n) {
        goal.value = n === null ? "" : String(n);
        updateSteps();
    }
    minus.onclick = function() {
        const n = goalNumber();
        if (n !== null) setGoal(n <= 1 ? null : Math.min(n - 1, MAX_GOAL));
    };
    plus.onclick = function() {
        const n = goalNumber();
        setGoal(n === null || n < 1 ? 1 : Math.min(n + 1, MAX_GOAL));
    };
    goal.oninput = updateSteps;

    if (profile) {
        name.value = profile.name || "";
        birth.value = profile.birthDate || "";
        height.value = profile.heightCm != null ? String(profile.heightCm) : "";
    }
    setGoal(profile && profile.weeklyGoal != null ? profile.weeklyGoal : null);

    function showError(message) {
        error.textContent = message;
        error.hidden = !message;
    }

    // What to tell the user, top to bottom; the server checks the same.
    function problem() {
        if (!name.value.trim()) return "Name is required.";
        if (birth.value && birth.value >= localIso(today)) return "Date of birth must be in the past.";
        if (birth.value && birth.value < birth.min) return "Date of birth is too far in the past.";
        const h = height.value.trim();
        if (h && !(/^\d+$/.test(h) && Number(h) >= 100 && Number(h) <= 250)) {
            return "Height must be between 100 and 250 cm.";
        }
        const g = goal.value.trim();
        if (g && !(/^\d+$/.test(g) && Number(g) >= 1 && Number(g) <= MAX_GOAL)) {
            return `Weekly goal must be between 1 and ${MAX_GOAL}.`;
        }
        return "";
    }

    form.onsubmit = async function(e) {
        e.preventDefault();
        const message = problem();
        if (message) {
            showError(message);
            return;
        }
        showError("");
        submit.disabled = true;
        try {
            const result = await saveProfile({
                name: name.value.trim(),
                birthDate: birth.value || null,
                heightCm: height.value.trim() ? Number(height.value.trim()) : null,
                weeklyGoal: goalNumber(),
            });
            if (!result.ok) {
                const first = result.data && result.data.errors && result.data.errors[0];
                showError(first && first.message ? first.message : "Something went wrong. Please try again.");
                return;
            }
            state.profile = result.data;
            onSaved(result.data);
        } catch (err) {
            showError("Unable to connect to the server. Please try again.");
        } finally {
            submit.disabled = false;
        }
    };
}

// Below the login layer (z-index 2000): if the login lapses meanwhile, the
// login page shows on top, and this is still here after logging in again.
export function showProfileSetup(onDone) {
    if (document.getElementById("profile-setup")) return;
    const screen = document.createElement("div");
    screen.className = "auth-screen profile-setup";
    screen.id = "profile-setup";
    screen.innerHTML = `
        <div class="auth-page">
            <div class="home-hero"><h1 class="home-title">Tsu2Track</h1></div>
            ${formHtml("Tell us about you!",
                "What should we call you? The rest is optional, and you can change it any time in Settings.",
                "Save")}
        </div>
    `;
    document.body.appendChild(screen);
    wireForm(null, function() {
        screen.remove();
        if (onDone) onDone();
    });
}

export async function renderProfilePage() {
    clearNavGuard();
    setRoute("#/settings/profile");
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <h2>Profile</h2>
        <div class="page-actions">
            <button class="btn-secondary" id="profile-back-btn">Back</button>
        </div>
        ${formHtml("", "", "Save")}
    `;
    document.getElementById("profile-back-btn").onclick = function() { renderSettingsPage(); };

    // Saving replaces every field, so never save over a profile we haven't
    // loaded: without it, the form stays shut.
    if (!state.profile) {
        try {
            state.profile = await fetchProfile();
        } catch (e) {
            const error = document.getElementById("profile-error");
            if (!error) return;
            error.textContent = "Unable to load your profile. Check your connection and try again.";
            error.hidden = false;
            document.getElementById("profile-submit").disabled = true;
            return;
        }
        if (!document.getElementById("profile-form")) return;   // navigated away meanwhile
    }
    wireForm(state.profile, function() { renderSettingsPage("Profile saved."); });
}
