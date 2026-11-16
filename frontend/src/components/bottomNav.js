import { renderHomePage } from "../views/home.js";
import { renderWorkouts } from "../views/workouts.js";
import { renderCalendarPage } from "../views/calendar.js";
import { renderExerciseLibrary } from "../views/library.js";

/* The tab bar's look, one word: "glass" (a floating frosted pill, icons
   only) or "pixel" (a floating pixel-framed bar with labels). Both are in
   bottom-nav.css; the space pages keep clear follows (variables.css). */
const NAV_STYLE = "glass";

const TABS = [
    {
        name: "home",
        label: "Home",
        render: renderHomePage,
        icon: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 11l9-8 9 8"/>
                <path d="M5 10v10h14V10"/>
            </svg>`
    },
    {
        name: "workouts",
        label: "Workouts",
        render: renderWorkouts,
        // A workout is a plan: a clipboard with a list.
        icon: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="5" y="4" width="14" height="17" rx="1"/>
                <path d="M9 2h6v4H9z"/>
                <path d="M8.5 11h7"/>
                <path d="M8.5 15h7"/>
            </svg>`
    },
    {
        name: "calendar",
        label: "Calendar",
        render: renderCalendarPage,
        icon: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="2"/>
                <path d="M3 10h18"/>
                <path d="M8 3v4"/>
                <path d="M16 3v4"/>
            </svg>`
    },
    {
        name: "exercises",
        label: "Exercises",
        render: function() { renderExerciseLibrary(); },
        // An exercise is one movement: a chunky dumbbell.
        icon: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M9 12h6"/>
                <rect x="5" y="7" width="4" height="10" rx="1"/>
                <rect x="15" y="7" width="4" height="10" rx="1"/>
                <path d="M3 10v4"/>
                <path d="M21 10v4"/>
            </svg>`
    }
];

/* Nav guard — a view registers an async function that returns true to allow
   tab navigation or false to block it (typically after the user confirms a
   discard prompt). Guards are auto-cleared after a successful navigation.
   Views that don't need a guard explicitly clear at the start of their
   render so stale guards don't survive direct (non-tab) navigation. */
let navGuard = null;

export function setNavGuard(fn) {
    navGuard = fn;
}

export function clearNavGuard() {
    navGuard = null;
}

// The guard in place, so a page opened on top of another can put it back.
export function getNavGuard() {
    return navGuard;
}

/* Toggle the entire bottom nav's visibility. Used by views that need a
   focused, distraction-free surface (the whole live workout, and pages it
   opens like the picker). body.nav-hidden lets bars that sit on the tab
   bar drop to the screen's bottom edge (bottom-nav.css). The nav guard
   still protects against programmatic tab switches while hidden. */
export function setNavVisible(visible) {
    const nav = document.getElementById("bottom-nav");
    nav.style.display = visible ? "" : "none";
    document.body.classList.toggle("nav-hidden", !visible);
}

export function renderBottomNav() {
    const nav = document.getElementById("bottom-nav");
    document.body.classList.add(`nav-${NAV_STYLE}`);
    // The label stays for screen readers when the look shows icons only.
    nav.innerHTML = `<div class="nav-bar">${TABS.map(t => `
        <button class="nav-tab" data-tab="${t.name}" aria-label="${t.label}">
            <span class="nav-icon">${t.icon}${t.name === "home" ? '<span class="nav-live-dot" aria-hidden="true"></span>' : ""}</span>
            <span class="nav-label">${t.label}</span>
        </button>
    `).join("")}</div>`;
    for (const tab of TABS) {
        nav.querySelector(`[data-tab="${tab.name}"]`).onclick = function() {
            setActiveTab(tab.name);
        };
    }
}

/* Show the nav with one tab lit, without rendering that tab's page. The
   router uses it to reopen a deeper page (e.g. a workout) under its tab. */
export function highlightTab(name) {
    setNavVisible(true);
    const nav = document.getElementById("bottom-nav");
    for (const cell of nav.querySelectorAll(".nav-tab")) {
        cell.classList.toggle("active", cell.dataset.tab === name);
    }
}

export async function setActiveTab(name) {
    const tab = TABS.find(t => t.name === name);
    if (!tab) return;
    if (navGuard) {
        const allow = await navGuard();
        if (!allow) return;
        navGuard = null;
    }
    highlightTab(name);
    // Each tab starts at the top; otherwise the previous tab's scroll
    // offset carries over and hides the top of the new page.
    document.getElementById("app-scroll").scrollTo(0, 0);
    tab.render();
}
