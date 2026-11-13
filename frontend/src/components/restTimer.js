/* Rest timer between sets: one per app, not per workout page.

   The countdown is an end time (Date.now() based), not a counter, and it's
   kept in localStorage: a phone that slept, a backgrounded app, a reload or
   a cold Home Screen start all come back to the right time left.

   - The ⏱ button lives in the live workout's Prev/Next bar (mountRestTimer).
     While resting it turns into a small ring with the time left inside.
     It opens a panel above the bar: quick times when idle; while running,
     a big ring countdown with − / + (15 s) either side and Stop under it.
     Starting a rest closes the panel; the big ring only shows when the
     small one is tapped.
   - The rings empty as the rest runs down. Their full length is the rest's
     length, − / + included.
   - "My time" is the rest time set in Settings, saved with the account
     (profile.restSeconds; 3:00 until set). Logging a set starts rest with
     it (startRest() with no argument). A quick time starts this one rest
     only; it doesn't change my time.
   - When rest is over, a pop-up on the right, just above the bottom bars
     (and the panel when open, moving as it opens or closes), says so on
     whatever page is showing. It goes after 10 s, or at once when tapped. */

import { state } from "../state.js";

const ENDS_AT_KEY = "restTimerEndsAt";
const TOTAL_KEY = "restTimerTotal";
// The account's rest time as last seen, for when the profile couldn't be
// loaded (offline start). The old key held the last quick time picked.
const SECONDS_KEY = "restTimerMySeconds";
const OLD_SECONDS_KEY = "restTimerSeconds";
export const QUICK_TIMES = [30, 45, 60, 90, 120, 180, 240, 300];
export const DEFAULT_REST_SECONDS = 180;
export const MIN_REST_SECONDS = 15;
export const MAX_REST_SECONDS = 600;
export const STEP_SECONDS = 15;
const POPUP_MS = 10000;
// A rest that ran out while the app was closed still gets its pop-up when
// the app comes back soon after; much later it's no news, so it's dropped.
const LATE_POPUP_MS = 5 * 60 * 1000;

let endsAt = null;
// The rest's full length in ms (what a full ring stands for).
let totalMs = null;
let ticker = null;
let popupTimer = null;
let popupFollow = null;
// The mounted bar button and panel, while the live workout page shows them.
let ui = null;

function readNumber(key) {
    try {
        const value = Number(localStorage.getItem(key));
        return Number.isFinite(value) && value > 0 ? value : null;
    } catch (e) {
        return null;
    }
}

function write(key, value) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, String(value));
    } catch (e) { /* the timer still runs for this visit */ }
}

// "My time": the account's rest time from Settings.
export function getRestSeconds() {
    const fromProfile = state.profile && state.profile.restSeconds;
    if (fromProfile) {
        if (readNumber(SECONDS_KEY) !== fromProfile) write(SECONDS_KEY, fromProfile);
        return fromProfile;
    }
    return readNumber(SECONDS_KEY) || DEFAULT_REST_SECONDS;
}

export function isResting() {
    return endsAt !== null;
}

function msLeft() {
    return endsAt === null ? 0 : Math.max(0, endsAt - Date.now());
}

function secondsLeft() {
    return Math.ceil(msLeft() / 1000);
}

// How much of the ring is still full: 1 at the start, 0 when rest is over.
function fractionLeft() {
    if (endsAt === null || !totalMs) return 0;
    return Math.min(1, msLeft() / totalMs);
}

// Quick times: 1:30.
export function formatRest(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

// Inside the rings: 01:30, like a clock.
function formatClock(seconds) {
    return formatRest(seconds).padStart(5, "0");
}

/* Starts (or restarts) rest. With no argument it uses my time; a number is
   a quick time picked for this rest only. */
export function startRest(seconds) {
    const length = seconds !== undefined ? seconds : getRestSeconds();
    totalMs = length * 1000;
    endsAt = Date.now() + totalMs;
    write(ENDS_AT_KEY, endsAt);
    write(TOTAL_KEY, totalMs);
    hidePopup();
    startTicking();
    render();
}

// − / + while resting. Taking it to 0:00 ends the rest.
export function adjustRest(deltaSeconds) {
    if (endsAt === null) return;
    endsAt += deltaSeconds * 1000;
    totalMs = Math.max(1, totalMs + deltaSeconds * 1000);
    write(ENDS_AT_KEY, endsAt);
    write(TOTAL_KEY, totalMs);
    tick();
}

// Stop, Finish and Discard: no pop-up.
export function stopRest() {
    clear();
    render();
}

function clear() {
    endsAt = null;
    totalMs = null;
    write(ENDS_AT_KEY, null);
    write(TOTAL_KEY, null);
    if (ticker !== null) {
        clearInterval(ticker);
        ticker = null;
    }
}

function startTicking() {
    if (ticker === null) ticker = setInterval(tick, 250);
}

function tick() {
    if (endsAt === null) return;
    const overFor = Date.now() - endsAt;
    if (overFor >= 0) {
        clear();
        // Panel back to quick times first: the pop-up is placed above it.
        render();
        if (overFor < LATE_POPUP_MS) showPopup();
        return;
    }
    render();
}

/* Called once at boot: picks up a rest that was running before a reload or
   a cold start, and catches one that ran out while the app was hidden
   (iOS pauses timers in the background). */
export function initRestTimer() {
    write(OLD_SECONDS_KEY, null);
    const saved = readNumber(ENDS_AT_KEY);
    if (saved !== null) {
        endsAt = saved;
        totalMs = readNumber(TOTAL_KEY) || Math.max(1, saved - Date.now());
        startTicking();
        tick();
    }
    document.addEventListener("visibilitychange", function() {
        if (document.visibilityState === "visible") tick();
    });
    // A tap on the dimmed tab bar hits its cover (the nav itself, not a tab).
    document.addEventListener("click", function(event) {
        if (ui && !ui.panel.hidden && event.target.id === "bottom-nav") closeRestPanel();
    });
}

/* ---------- Bar button and panel ---------- */

const STOPWATCH_ICON = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="14" r="7"/>
        <path d="M12 14V10.5"/>
        <path d="M10 3h4"/>
        <path d="M12 3v4"/>
    </svg>`;

/* A countdown ring: a track, and an arc that empties clockwise from the
   top (setRing moves it). r is in a 100×100 box. */
function ringHtml(className, r) {
    const length = 2 * Math.PI * r;
    return `
        <div class="rest-ring ${className}" style="--ring-length: ${length}">
            <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle class="rest-ring-track" cx="50" cy="50" r="${r}"/>
                <circle class="rest-ring-arc" cx="50" cy="50" r="${r}"
                        stroke-dasharray="${length}" stroke-dashoffset="0"/>
            </svg>
            <span class="rest-ring-time"></span>
        </div>`;
}

function setRing(ring, fraction, text) {
    if (!ring) return;
    const arc = ring.querySelector(".rest-ring-arc");
    const length = Number(arc.getAttribute("stroke-dasharray"));
    arc.setAttribute("stroke-dashoffset", String(length * (1 - fraction)));
    ring.querySelector(".rest-ring-time").textContent = text;
}

/* Puts the ⏱ button into the bar's middle cell, under the counter (so Prev
   and Next stay symmetric around it), and the panel above the bar. Both go when the page is replaced. */
export function mountRestTimer(navRow, counter) {
    const middle = document.createElement("div");
    middle.className = "rest-timer-middle";
    counter.replaceWith(middle);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "rest-timer-btn";
    button.id = "rest-timer-btn";
    button.innerHTML = `
        <span class="rest-timer-icon">${STOPWATCH_ICON}</span>
        ${ringHtml("rest-ring-small", 44)}`;
    middle.appendChild(counter);
    middle.appendChild(button);

    const panel = document.createElement("div");
    panel.className = "rest-timer-panel";
    panel.id = "rest-timer-panel";
    panel.hidden = true;
    navRow.appendChild(panel);

    // While the panel is open the rest of the page is dimmed and can't be
    // used (sets, tab bar); a tap there closes the panel. The bar (Prev,
    // ⏱, Next) stays on top of it.
    const backdrop = document.createElement("div");
    backdrop.className = "rest-timer-backdrop";
    backdrop.id = "rest-timer-backdrop";
    backdrop.hidden = true;
    backdrop.onclick = closeRestPanel;
    navRow.before(backdrop);

    ui = { button, panel, backdrop, navRow, shownState: null };
    button.onclick = function() {
        panel.hidden = !panel.hidden;
        render();
    };
    render();
}

export function closeRestPanel() {
    if (ui && ui.panel.isConnected) ui.panel.hidden = true;
    render();
}

function render() {
    renderBar();
    placePopup();
}

function renderBar() {
    if (!ui) return;
    if (!ui.button.isConnected) {
        ui = null;
        document.body.classList.remove("rest-timer-open");
        return;
    }
    const resting = isResting();
    const clock = formatClock(secondsLeft());
    const fraction = fractionLeft();
    ui.button.classList.toggle("resting", resting);
    ui.button.classList.toggle("open", !ui.panel.hidden);
    ui.button.setAttribute("aria-label", resting ? `Rest timer, ${clock} left` : "Rest timer");
    setRing(ui.button.querySelector(".rest-ring"), fraction, resting ? clock : "");
    ui.backdrop.hidden = ui.panel.hidden;
    ui.navRow.classList.toggle("rest-open", !ui.panel.hidden);
    document.body.classList.toggle("rest-timer-open", !ui.panel.hidden);
    if (ui.panel.hidden) return;

    // Rebuilt only when it switches between idle and running (or my time
    // changed); each tick just moves the ring and the time.
    const state = resting ? "running" : `idle-${getRestSeconds()}`;
    if (ui.shownState !== state) {
        ui.shownState = state;
        buildPanel(resting);
    }
    if (resting) setRing(ui.panel.querySelector(".rest-ring"), fraction, clock);
}

function buildPanel(resting) {
    const panel = ui.panel;
    if (resting) {
        panel.innerHTML = `
            <div class="rest-timer-running">
                <button type="button" class="btn-secondary rest-timer-step"
                        data-step="-${STEP_SECONDS}" aria-label="15 seconds less">−</button>
                ${ringHtml("rest-ring-big", 45)}
                <button type="button" class="btn-secondary rest-timer-step"
                        data-step="${STEP_SECONDS}" aria-label="15 seconds more">+</button>
            </div>
            <button type="button" class="btn-danger rest-timer-stop">Stop</button>`;
        panel.querySelectorAll(".rest-timer-step").forEach(step => {
            step.onclick = function() { adjustRest(Number(step.dataset.step)); };
        });
        panel.querySelector(".rest-timer-stop").onclick = stopRest;
        return;
    }
    const mine = getRestSeconds();
    const chips = QUICK_TIMES.map(s => `
        <button type="button" class="rest-timer-chip${s === mine ? " mine" : ""}"
                data-seconds="${s}">${formatRest(s)}</button>`).join("");
    panel.innerHTML = `
        <div class="rest-timer-label">Rest for</div>
        <div class="rest-timer-chips">${chips}</div>`;
    panel.querySelectorAll(".rest-timer-chip").forEach(chip => {
        // The panel closes: the small ring in the bar shows the rest, and
        // tapping it opens the big one.
        chip.onclick = function() {
            panel.hidden = true;
            startRest(Number(chip.dataset.seconds));
        };
    });
}

/* ---------- "Rest over" pop-up ---------- */

function showPopup() {
    hidePopup();
    const popup = document.createElement("button");
    popup.type = "button";
    popup.className = "rest-timer-popup";
    popup.id = "rest-timer-popup";
    popup.setAttribute("role", "status");
    popup.innerHTML = `
        ${STOPWATCH_ICON}
        <span class="rest-timer-popup-text">
            <strong>Rest over</strong>
            <span>Tap to close</span>
        </span>`;
    popup.onclick = hidePopup;
    document.body.appendChild(popup);
    placePopup();
    popupTimer = setTimeout(hidePopup, POPUP_MS);
    // Follows what is under it while it shows: the panel opening or closing
    // (render places it at once), or another page with other bars.
    popupFollow = setInterval(placePopup, 250);
}

/* Just above whatever sits at the bottom of the screen: the tab bar, or
   in a live workout the Prev / ⏱ / Next bar (and its panel, if open), so
   the pop-up never covers them. */
const POPUP_GAP = 12;

function placePopup() {
    const popup = document.getElementById("rest-timer-popup");
    if (popup) popup.style.bottom = `${popupBottom()}px`;
}

function popupBottom() {
    let top = window.innerHeight;
    for (const id of ["bottom-nav", "exercise-nav-row", "rest-timer-panel"]) {
        const el = document.getElementById(id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.height > 0) top = Math.min(top, rect.top);
    }
    return window.innerHeight - top + POPUP_GAP;
}

function hidePopup() {
    if (popupTimer !== null) {
        clearTimeout(popupTimer);
        popupTimer = null;
    }
    if (popupFollow !== null) {
        clearInterval(popupFollow);
        popupFollow = null;
    }
    const popup = document.getElementById("rest-timer-popup");
    if (popup) popup.remove();
}
