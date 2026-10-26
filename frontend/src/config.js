// In a browser the backend runs on port 8080 of whichever machine served
// this page, so the same build works from the PC (127.0.0.1) and from the
// phone over Tailscale (the PC's tailnet address).
//
// Inside the iOS app the page is served from capacitor://localhost, so
// there is no machine to derive it from: it defaults to the PC's tailnet
// address and can be overridden with
//   localStorage.setItem("fitness.apiBase", "http://<host>:8080")
const NATIVE_API_BASE = "http://100.110.203.64:8080";

function nativeApiBase() {
    try {
        return localStorage.getItem("fitness.apiBase") || NATIVE_API_BASE;
    } catch (e) {
        return NATIVE_API_BASE;
    }
}

export const API_BASE = window.Capacitor?.isNativePlatform?.()
    ? nativeApiBase()
    : `${location.protocol}//${location.hostname}:8080`;

export const CATEGORY_ORDER = ["CHEST", "ARMS", "BACK", "LEGS", "SHOULDERS", "CORE", "CARDIO", "OTHER"];

// How an exercise's sets are logged (the backend's LogType). Cardio is
// always Distance & time, so the form hides the choice for it.
export const LOG_TYPES = [
    { value: "WEIGHT_REPS", label: "Weight & reps" },
    { value: "REPS", label: "Reps" },
    { value: "TIME", label: "Time" },
    { value: "DISTANCE_TIME", label: "Distance & time" }
];

/* The numbers a set has, by type: "time" is one value in seconds (typed
   as min : sec), and km is the only optional one. A set row's boxes
   (components/setInputRow.js) and the summary's columns follow this. */
export const LOG_COLUMNS = {
    WEIGHT_REPS: ["weight", "reps"],
    REPS: ["reps"],
    TIME: ["time"],
    DISTANCE_TIME: ["km", "time"]
};

export function logColumns(logType) {
    return LOG_COLUMNS[logType] || LOG_COLUMNS.WEIGHT_REPS;
}

export function logTypeLabel(value) {
    const t = LOG_TYPES.find(t => t.value === value);
    return t ? t.label : "Weight & reps";
}

// Exercise Type choices. Saved as plain text, so more (e.g. Isometric) can
// just be added here.
export const EXERCISE_TYPES = ["Compound", "Isolation"];

// Equipment choices, spelled as the built-in exercises have them
// (BuiltInExercises, which also renames "e-z curl bar"), most used first.
export const EQUIPMENT = [
    "Barbell", "Dumbbell", "Cable", "Machine", "Kettlebells", "Body only",
    "Bands", "EZ Bar", "Exercise ball", "Medicine ball", "Other"
];
