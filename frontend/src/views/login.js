import { login, signup } from "../api.js";
import { setToken } from "../auth.js";

/* Log in / Create account, one screen with two tabs. Shown at startup when
   there's no login, and whenever the server rejects the token (expired or
   revoked) — see main.js. It leaves the address alone, so after logging
   in the app reloads straight back to the page the user was on.

   It's its own full-screen layer above the app, nav and popups rather
   than a page in #app-content: a view whose request just failed may still
   finish drawing, and must not land on top of the login.

   A real <form> with autocomplete hints, so iOS offers to save the
   password and fills it in next time. No field is focused on open (the
   keyboard would cover the page). */
let showing = false;

// Something@something.something, no spaces: the server's rule too
// (SignupRequest). The browser's own email check accepts "name@gmail".
const EMAIL_FORMAT = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function renderLoginPage() {
    // Every failing request reports the expired login; draw the page once
    // so what's being typed isn't wiped.
    if (showing) return;
    showing = true;

    const screen = document.createElement("div");
    screen.className = "auth-screen";
    screen.id = "auth-screen";
    screen.innerHTML = `
        <div class="auth-page">
            <div class="home-hero"><h1 class="home-title">Tsu2Track</h1></div>
            <form class="auth-panel" id="auth-form" novalidate>
                <div class="auth-tabs" role="tablist">
                    <button type="button" class="filter-pill auth-tab" data-mode="login" role="tab">Log in</button>
                    <button type="button" class="filter-pill auth-tab" data-mode="signup" role="tab">Create account</button>
                </div>
                <label class="auth-field">
                    <span class="auth-label">Email</span>
                    <input id="auth-email" type="email" name="email" autocomplete="username"
                           autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="email">
                </label>
                <div class="auth-field">
                    <label class="auth-label" for="auth-password">Password</label>
                    <div class="auth-password-row">
                        <input id="auth-password" type="password" name="password">
                        <button type="button" class="btn-secondary auth-show" id="auth-show"
                                aria-controls="auth-password auth-confirm"></button>
                    </div>
                    <span class="auth-hint" id="auth-password-hint">At least 8 characters.</span>
                </div>
                <div class="auth-field" id="auth-confirm-field">
                    <label class="auth-label" for="auth-confirm">Confirm password</label>
                    <input id="auth-confirm" type="password" name="confirm-password" autocomplete="new-password">
                </div>
                <label class="auth-field" id="auth-invite-field">
                    <span class="auth-label">Invite code</span>
                    <input id="auth-invite" type="text" name="invite" autocomplete="off"
                           autocapitalize="off" autocorrect="off" spellcheck="false">
                </label>
                <p class="auth-error" id="auth-error" role="alert" hidden></p>
                <button type="submit" class="auth-submit" id="auth-submit"></button>
            </form>
        </div>
    `;
    document.body.appendChild(screen);

    const form = document.getElementById("auth-form");
    const email = document.getElementById("auth-email");
    const password = document.getElementById("auth-password");
    const confirm = document.getElementById("auth-confirm");
    const show = document.getElementById("auth-show");
    const invite = document.getElementById("auth-invite");
    const error = document.getElementById("auth-error");
    const submit = document.getElementById("auth-submit");
    let mode = "login";

    function setMode(next) {
        mode = next;
        for (const tab of form.querySelectorAll(".auth-tab")) {
            const on = tab.dataset.mode === mode;
            tab.classList.toggle("selected", on);
            tab.setAttribute("aria-selected", String(on));
        }
        const signingUp = mode === "signup";
        document.getElementById("auth-invite-field").hidden = !signingUp;
        document.getElementById("auth-confirm-field").hidden = !signingUp;
        document.getElementById("auth-password-hint").hidden = !signingUp;
        password.autocomplete = signingUp ? "new-password" : "current-password";
        submit.textContent = signingUp ? "Create account" : "Log in";
        showError("");
    }

    function showError(message) {
        error.textContent = message;
        error.hidden = !message;
    }

    // One Show/Hide button for both password fields.
    function setPasswordsShown(shown) {
        for (const field of [password, confirm]) field.type = shown ? "text" : "password";
        show.textContent = shown ? "Hide" : "Show";
        show.setAttribute("aria-pressed", String(shown));
        show.setAttribute("aria-label", shown ? "Hide password" : "Show password");
    }

    // What to tell the user, in the order they'd fix it.
    function problem() {
        if (!email.value.trim()) return "Email is required.";
        if (mode === "signup" && !EMAIL_FORMAT.test(email.value.trim())) return "Invalid email format.";
        if (!password.value) return "Password is required.";
        if (mode === "signup" && password.value.length < 8) return "Password must be at least 8 characters.";
        if (mode === "signup" && !confirm.value) return "Password confirmation is required.";
        if (mode === "signup" && confirm.value !== password.value) return "Passwords do not match.";
        if (mode === "signup" && !invite.value.trim()) return "Invite code is required.";
        return "";
    }

    for (const tab of form.querySelectorAll(".auth-tab")) {
        tab.onclick = function() { setMode(tab.dataset.mode); };
    }

    // Tapping Show mustn't take focus from the field being typed in (on a
    // phone that would drop the keyboard).
    show.onmousedown = function(e) { e.preventDefault(); };
    show.onclick = function() { setPasswordsShown(password.type === "password"); };

    form.onsubmit = async function(e) {
        e.preventDefault();
        // Back to dots before sending: iOS offers to save a password only
        // from a password field.
        setPasswordsShown(false);
        const message = problem();
        if (message) {
            showError(message);
            return;
        }
        showError("");
        submit.disabled = true;
        try {
            const result = mode === "signup"
                ? await signup(email.value.trim(), password.value, invite.value.trim())
                : await login(email.value.trim(), password.value);
            if (!result.ok) {
                showError(serverMessage(result));
                return;
            }
            setToken(result.data.token);
            // A fresh start loads this account's data and reopens the page
            // in the address (or the last one remembered).
            location.reload();
        } catch (err) {
            showError("Unable to connect to the server. Please try again.");
        } finally {
            submit.disabled = false;
        }
    };

    setPasswordsShown(false);
    setMode("login");
}

// The server's explanation, reworded where its validation text is technical.
function serverMessage(result) {
    const first = result.data && result.data.errors && result.data.errors[0];
    if (first && first.field === "email" && result.status === 400) return "Invalid email format.";
    if (first && first.field === "password" && result.status === 400) return "Password must be 8 to 72 characters.";
    if (first && first.message) return first.message;
    return "Something went wrong. Please try again.";
}
