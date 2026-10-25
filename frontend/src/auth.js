// Login token from POST /auth/login or /auth/signup, sent on every other
// request as "Authorization: Bearer <token>" (api.js). The server keeps
// only its hash and drops it after 90 days unused.
//
// Security note: localStorage is readable by any JS running on this
// origin, so a stored XSS bug would expose the token (views escape what
// they render for that reason). In the native app it moves to the
// Keychain.

const TOKEN_KEY = "fitness.authToken";

// The shared key used before accounts; nothing reads it any more.
try { localStorage.removeItem("fitness.apiKey"); } catch (e) { /* ignore */ }

export function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
}

export function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
}
