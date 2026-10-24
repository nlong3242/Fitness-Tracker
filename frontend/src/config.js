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

export const CATEGORY_ORDER = ["CHEST", "ARMS", "BACK", "LEGS", "SHOULDERS", "CORE"];
