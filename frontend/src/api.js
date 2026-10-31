import { API_BASE } from "./config.js";
import { getToken, clearToken } from "./auth.js";

// Called when the server says the login is missing, revoked or expired
// (main.js shows the login page). The request still fails with ApiError.
let onUnauthorized = null;

export function setUnauthorizedHandler(fn) {
    onUnauthorized = fn;
}

async function request(method, path, body) {
    const opts = { method, headers: {} };
    const token = getToken();
    if (token) {
        opts.headers["Authorization"] = `Bearer ${token}`;
    }
    if (body !== undefined) {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body);
    }
    const response = await fetch(`${API_BASE}${path}`, opts);

    if (response.status === 401) {
        clearToken();
        if (onUnauthorized) onUnauthorized();
    }
    return response;
}

// --- Accounts ---

/* Sign-up and login don't need a token. Both answer { ok, data }: on
   success data is { token, user }, otherwise the error body, whose
   errors[0] says what to fix. Throws only when the server can't be reached. */
async function authRequest(path, body) {
    const response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
}

export function signup(email, password, inviteCode) {
    return authRequest("/auth/signup", { email, password, inviteCode });
}

export function login(email, password) {
    return authRequest("/auth/login", { email, password });
}

// Answers { ok, status, data } like signup/login: a wrong current password
// is a 400 whose errors[0] explains it. Other devices get logged out.
export async function changePassword(currentPassword, newPassword) {
    const response = await request("POST", "/auth/password", { currentPassword, newPassword });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
}

// Ends every login of this account, this device's included.
export function logoutEverywhere() {
    return requestOk("POST", "/auth/logout-all");
}

// --- Profile ---

// { name, birthDate, heightCm, weeklyGoal }, or null before it's first saved.
export async function fetchProfile() {
    const response = await request("GET", "/profile");
    if (response.status === 204) return null;
    if (!response.ok) throw new ApiError(response);
    return response.json();
}

// Saves every field (a blank one is cleared). Answers { ok, status, data }
// like changePassword: a 400's errors[0] says what to fix. weekStart (local
// Monday, YYYY-MM-DD) is the week a new weekly goal counts from.
export async function saveProfile(profile, weekStart) {
    const response = await request("PUT", `/profile?weekStart=${weekStart}`, profile);
    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
}

// { id, email } of the logged-in account.
export function fetchMe() {
    return requestJson("GET", "/auth/me");
}

/* Ends this device's login on the server. Called straight, not through
   request(): an already-expired token (401) is logged out anyway, and
   mustn't open the login page before the caller has cleaned up. */
export async function logout() {
    const token = getToken();
    if (!token) return;
    await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
    });
}

/* Thrown for non-2xx responses so an error envelope is never mistaken for
   data (e.g. a 409 on createSet used to come back as if it were the set). */
export class ApiError extends Error {
    constructor(response) {
        super(`${response.status} ${response.statusText}`);
        this.status = response.status;
    }
}

async function requestJson(method, path, body) {
    const response = await request(method, path, body);
    if (!response.ok) throw new ApiError(response);
    return response.json();
}

// For endpoints whose callers only need success/failure.
async function requestOk(method, path, body) {
    const response = await request(method, path, body);
    if (!response.ok) throw new ApiError(response);
    return response;
}

// --- Workouts ---

export function fetchWorkouts() {
    return requestJson("GET", "/workouts");
}

export function createWorkout(data) {
    return requestJson("POST", "/workouts", data);
}

export function deleteWorkout(workoutId) {
    return request("DELETE", `/workouts/${workoutId}`);
}

// --- Workout exercises ---

export function fetchWorkoutExercises(workoutId) {
    return requestJson("GET", `/workouts/${workoutId}/exercises`);
}

export function linkExerciseToWorkout(workoutId, exerciseId) {
    return request("POST", `/workouts/${workoutId}/exercises/${exerciseId}/link`);
}

export function updateWorkoutExercise(workoutId, exerciseId, data) {
    return request("PUT", `/workouts/${workoutId}/exercises/${exerciseId}`, data);
}

export function removeWorkoutExercise(workoutId, exerciseId) {
    return request("DELETE", `/workouts/${workoutId}/exercises/${exerciseId}`);
}

export function replaceWorkoutExercise(workoutId, exerciseId, replacementId) {
    return request("PUT", `/workouts/${workoutId}/exercises/${exerciseId}/replace/${replacementId}`);
}

export function reorderWorkoutExercises(workoutId, orderedExerciseIds) {
    return request("PATCH", `/workouts/${workoutId}/exercises/order`, { orderedExerciseIds });
}

export function fetchLastSets(workoutId, exerciseId, beforeSessionId) {
    const query = beforeSessionId ? `?beforeSessionId=${beforeSessionId}` : "";
    return requestJson("GET", `/workouts/${workoutId}/exercises/${exerciseId}/last-sets${query}`);
}

// --- Sessions ---

export function fetchSessionsPage(workoutId, page, size) {
    return requestJson("GET", `/workouts/${workoutId}/sessions?page=${page}&size=${size}`);
}

export function createSession(workoutId) {
    return requestJson("POST", `/workouts/${workoutId}/sessions`);
}

export function deleteSession(sessionId) {
    return request("DELETE", `/sessions/${sessionId}`);
}

export function finishSession(sessionId, orderedExerciseIds) {
    return requestOk("POST", `/sessions/${sessionId}/finish`, { orderedExerciseIds });
}

// Home page stats for the week starting weekStart (local Monday, YYYY-MM-DD):
// { sessionsThisWeek, lastSession: { id, workoutId, date, ... } | null,
//   weekStreak, nextPlanned: { id, workoutId, date, ... } | null }; today
//   (local YYYY-MM-DD) decides which plans still count as upcoming.
export function fetchOverview(weekStart, today) {
    return requestJson("GET", `/sessions/overview?weekStart=${weekStart}&today=${today}`);
}

// --- Exercise history ---

// { records: { heaviest, bestSet } (each { weight, reps, date } | null),
//   sessions: [{ sessionId, date, workoutId, sets: [{ weight, reps, side, pr }] }],
//   hasMore } — finished sessions only, newest first.
export function fetchExerciseHistory(exerciseId, page, size) {
    return requestJson("GET", `/exercises/${exerciseId}/history?page=${page}&size=${size}`);
}

// --- Bodyweight ---

// { latest: { date, weightKg } | null, weekChange: number | null } as of
// `today` (local YYYY-MM-DD).
export function fetchBodyWeightSummary(today) {
    return requestJson("GET", `/bodyweight/summary?today=${today}`);
}

// Every weigh-in, oldest first: [{ date, weightKg }, ...].
export function fetchBodyWeightHistory() {
    return requestJson("GET", "/bodyweight");
}

export function deleteBodyWeight(date) {
    return requestOk("DELETE", `/bodyweight/${date}`);
}

// Saves (or replaces) the weigh-in for a date. Throws ApiError on failure.
export function logBodyWeight(date, weightKg) {
    return requestJson("PUT", `/bodyweight/${date}`, { weightKg });
}

// The started-but-not-finished session to offer for resume, or null.
export async function fetchUnfinishedSession() {
    const response = await requestOk("GET", "/sessions/unfinished");
    return response.status === 204 ? null : response.json();
}

export function fetchSessionExercises(sessionId) {
    return requestJson("GET", `/sessions/${sessionId}/exercises`);
}

export function fetchSessionSets(sessionId) {
    return requestJson("GET", `/sessions/${sessionId}/sets`);
}

// Returns the raw response so callers can check .ok before parsing.
export function fetchPreviousTotals(workoutId, sessionId) {
    return request("GET", `/workouts/${workoutId}/sessions/${sessionId}/previous-totals`);
}

// --- Scheduled workouts ---

export function fetchSchedulesInRange(from, to) {
    return requestJson("GET", `/scheduled-workouts?from=${from}&to=${to}`);
}

export function fetchSchedulesByDate(date) {
    return requestJson("GET", `/scheduled-workouts/by-date/${date}`);
}

// Mutating endpoints return the raw response so callers can branch on
// status — 409 means the (date, workoutId) pair is already scheduled.
export function createSchedule(data) {
    return request("POST", `/scheduled-workouts`, data);
}

export function updateSchedule(scheduleId, data) {
    return request("PATCH", `/scheduled-workouts/${scheduleId}`, data);
}

export function deleteSchedule(scheduleId) {
    return request("DELETE", `/scheduled-workouts/${scheduleId}`);
}

// Saves still in flight, so a double tap doesn't save the same day twice.
const repeatDaySaves = new Map();

/* A day planned by a repeat rule has id null until it's saved. Saves it as an
   ordinary entry and returns its id; a day that's already saved (409, e.g. on
   another device) returns that entry's id. Throws if it can't be saved. */
export function saveRepeatDay(day) {
    const key = `${day.workoutId}|${day.repeatDate}`;
    if (!repeatDaySaves.has(key)) {
        repeatDaySaves.set(key, postRepeatDay(day).finally(() => repeatDaySaves.delete(key)));
    }
    return repeatDaySaves.get(key);
}

async function postRepeatDay(day) {
    const response = await createSchedule({
        date: day.date,
        workoutId: day.workoutId,
        repeatDate: day.repeatDate
    });
    if (response.ok) return (await response.json()).id;
    if (response.status === 409) {
        const existing = await fetchSchedulesByDate(day.date);
        const saved = existing.find(s =>
            s.workoutId === day.workoutId && s.id !== null && s.status !== "COMPLETED");
        if (saved) return saved.id;
    }
    throw new Error(`Couldn't save the repeat day (${response.status})`);
}

// --- Repeating plans ---

// The rule in force today or the next to start, or null.
export async function fetchRepeat(workoutId, today) {
    const response = await request("GET", `/workouts/${workoutId}/repeat?today=${today}`);
    if (response.status === 204) return null;
    if (!response.ok) throw new ApiError(response);
    return response.json();
}

// Returns the raw response, like the schedule calls above.
export function saveRepeat(workoutId, data, today) {
    return request("PUT", `/workouts/${workoutId}/repeat?today=${today}`, data);
}

// Nothing planned from today on; finished and skipped days stay.
export function stopRepeat(workoutId, today) {
    return request("DELETE", `/workouts/${workoutId}/repeat?today=${today}`);
}

// --- Sets ---

export function createSet(sessionId, exerciseId, body) {
    return requestJson("POST", `/sessions/${sessionId}/sets?exerciseId=${exerciseId}`, body);
}

export function updateSet(setId, body) {
    return requestJson("PUT", `/sets/${setId}`, body);
}

export function deleteSet(setId) {
    return requestOk("DELETE", `/sets/${setId}`);
}

// --- Exercises ---

export function fetchExercises() {
    return requestJson("GET", "/exercises");
}

export function fetchExercise(exerciseId) {
    return requestJson("GET", `/exercises/${exerciseId}`);
}

export function createExercise(data) {
    return requestJson("POST", "/exercises", data);
}

export function updateExercise(exerciseId, data) {
    return request("PUT", `/exercises/${exerciseId}`, data);
}

export function deleteExercise(exerciseId) {
    return request("DELETE", `/exercises/${exerciseId}`);
}

// A Custom copy of a built-in exercise; it takes over from it (workouts,
// history, note). Resolves to the copy.
export function copyExercise(exerciseId) {
    return requestJson("POST", `/exercises/${exerciseId}/copy`);
}

export function updateExerciseNote(exerciseId, content) {
    return requestJson("PUT", `/exercises/${exerciseId}/note`, { content });
}
