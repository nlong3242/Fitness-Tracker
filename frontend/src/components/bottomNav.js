import { renderHomePage } from "../views/home.js";
import { renderWorkouts } from "../views/workouts.js";
import { renderCalendarPage } from "../views/calendar.js";
import { renderExerciseLibrary } from "../views/library.js";

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
        icon: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M6 6v12"/>
                <path d="M18 6v12"/>
                <path d="M3 9v6"/>
                <path d="M21 9v6"/>
                <path d="M6 12h12"/>
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
        icon: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="4" y="5" width="16" height="3" rx="0.5"/>
                <rect x="4" y="11" width="16" height="3" rx="0.5"/>
                <rect x="4" y="17" width="16" height="3" rx="0.5"/>
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

/* Toggle the entire bottom nav's visibility. Used by views that need a
   focused, distraction-free surface (e.g., the live workout preview). The
   nav guard still protects against programmatic tab switches while hidden. */
export function setNavVisible(visible) {
    const nav = document.getElementById("bottom-nav");
    nav.style.display = visible ? "" : "none";
}

export function renderBottomNav() {
    const nav = document.getElementById("bottom-nav");
    nav.innerHTML = TABS.map(t => `
        <button class="nav-tab" data-tab="${t.name}">
            <span class="nav-icon">${t.icon}</span>
            <span class="nav-label">${t.label}</span>
        </button>
    `).join("");
    for (const tab of TABS) {
        nav.querySelector(`[data-tab="${tab.name}"]`).onclick = function() {
            setActiveTab(tab.name);
        };
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
    const nav = document.getElementById("bottom-nav");
    nav.style.display = "";
    for (const cell of nav.querySelectorAll(".nav-tab")) {
        cell.classList.toggle("active", cell.dataset.tab === name);
    }
    tab.render();
}
