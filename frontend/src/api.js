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

export function updateExerciseNote(exerciseId, content) {
    return requestJson("PUT", `/exercises/${exerciseId}/note`, { content });
}
