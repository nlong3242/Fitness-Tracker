import { fetchExercise, fetchExercises } from "../api.js";
import { renderCategoryPillRow, renderCustomToggle } from "../components/categoryPills.js";
import { renderLibraryList } from "../components/libraryList.js";
import { setActiveTab, clearNavGuard } from "../components/bottomNav.js";
import { renderExercisePage } from "./exercisePage.js";
import { renderExerciseCreatePage } from "./exerciseEdit.js";
import { setRoute } from "../router.js";

// initialQuery and initialCustomOnly: the search and the Custom only switch
// to keep when coming back from an exercise.
export async function renderExerciseLibrary(initialCategory, initialQuery, initialCustomOnly) {
    clearNavGuard();
    setRoute("#/exercises");
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <div class="page-actions page-top">
            <button class="btn-secondary" id="library-back-btn">Back</button>
        </div>
        <h2 class="page-title">Exercise Library</h2>
        <div class="page-actions">
            <button id="library-create-btn">Create Exercise</button>
            <button type="button" class="btn-secondary eye-btn" id="library-eye-btn" aria-label="Hide built-in exercises"></button>
        </div>
        <input type="search" id="library-search" class="library-search" placeholder="Search exercises"
               autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
        <p class="custom-only-note" id="library-custom-note" hidden>Showing your Custom exercises only.</p>
        <div id="library-pill-row" class="library-pill-row"></div>
        <div id="library-groups"></div>
    `;

    let selectedCategory = initialCategory || "ALL";
    let customOnly = !!initialCustomOnly;

    document.getElementById("library-back-btn").onclick = function() { setActiveTab("home"); };
    document.getElementById("library-create-btn").onclick = function() {
        renderExerciseCreatePage({
            category: selectedCategory,
            onCancel: function() { renderExerciseLibrary(selectedCategory, search.value, customOnly); },
            onCreated: function(created) { renderExerciseLibrary(created.category, "", customOnly); }
        });
    };

    const exercises = await fetchExercises();
    const groupsContainer = document.getElementById("library-groups");
    const pillContainer = document.getElementById("library-pill-row");
    const toggleButton = document.getElementById("library-eye-btn");
    const customNote = document.getElementById("library-custom-note");

    // The list only has names and categories; the page needs the rest.
    async function onRowClick(row) {
        let exercise;
        try {
            exercise = await fetchExercise(row.id);
        } catch (e) {
            return;   // offline or gone: stay on the list
        }
        renderExercisePage(exercise, {
            routeFor: id => `#/exercises/${id}`,
            onBack: function() { renderExerciseLibrary(selectedCategory, search.value, customOnly); }
        });
    }

    const search = document.getElementById("library-search");
    search.value = initialQuery || "";
    function renderList() {
        renderLibraryList(groupsContainer, exercises, selectedCategory, onRowClick, search.value, customOnly);
    }
    function rerender() {
        renderCategoryPillRow(pillContainer, selectedCategory, function(cat) {
            selectedCategory = cat;
            rerender();
        });
        renderCustomToggle(toggleButton, customNote, customOnly, function(on) {
            customOnly = on;
            rerender();
        });
        renderList();
    }
    search.oninput = renderList;
    // Return/Search on the keyboard just puts it away.
    search.onkeydown = function(e) { if (e.key === "Enter") search.blur(); };
    rerender();
}
