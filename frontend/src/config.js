// The backend runs on port 8080 of whichever machine served this page, so
// the same build works from the PC (127.0.0.1) and from the phone over
// Tailscale (the PC's tailnet address).
export const API_BASE = `${location.protocol}//${location.hostname}:8080`;

export const CATEGORY_ORDER = ["CHEST", "ARMS", "BACK", "LEGS", "SHOULDERS", "CORE"];
