import { API_BASE } from "./config.js";
import { getApiKey, setApiKey, clearApiKey } from "./auth.js";

async function request(method, path, body, _isRetry = false) {
    const opts = { method, headers: {} };
    const key = getApiKey();
    if (key) {
        opts.headers["X-API-Key"] = key;
    }
    if (body !== undefined) {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body);
    }
    const response = await fetch(`${API_BASE}${path}`, opts);

    if (response.status === 401 && !_isRetry) {
        clearApiKey();
        let entered;
        do {
            entered = window.prompt('Enter your API key. (Use "dev-key" for local dev.)');
        } while (!entered);
        setApiKey(entered);
        return request(method, path, body, true);
    }
    return response;
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
// { sessionsThisWeek, lastSession: { id, workoutId, date, ... } | null }.
export function fetchOverview(weekStart) {
    return requestJson("GET", `/sessions/overview?weekStart=${weekStart}`);
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
