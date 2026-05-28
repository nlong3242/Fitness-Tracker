// Single-user API key stored in localStorage. The backend filter
// (ApiKeyAuthFilter) compares the X-API-Key header against app.api-key.
//
// Security note: localStorage is readable by any JS running on this
// origin, so a stored XSS bug would expose the key. Do not store
// anything more sensitive here. Tier 2 will replace this with an
// HttpOnly-cookie session when real users land.

const STORAGE_KEY = "fitness.apiKey";

export function getApiKey() {
    return localStorage.getItem(STORAGE_KEY);
}

export function setApiKey(key) {
    localStorage.setItem(STORAGE_KEY, key);
}

export function clearApiKey() {
    localStorage.removeItem(STORAGE_KEY);
}
