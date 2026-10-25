import { fetchExercise, fetchExercises } from "../api.js";
import { renderCategoryPillRow } from "../components/categoryPills.js";
import { renderLibraryList } from "../components/libraryList.js";
import { setActiveTab, clearNavGuard } from "../components/bottomNav.js";
import { renderExercisePage } from "./exercisePage.js";
import { renderExerciseCreatePage } from "./exerciseEdit.js";
import { setRoute } from "../router.js";

// initialQuery: the search to keep when coming back from an exercise.
export async function renderExerciseLibrary(initialCategory, initialQuery) {
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
        </div>
        <input type="search" id="library-search" class="library-search" placeholder="Search exercises"
               autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
        <div id="library-pill-row" class="library-pill-row"></div>
        <div id="library-groups"></div>
    `;

    let selectedCategory = initialCategory || "ALL";

    document.getElementById("library-back-btn").onclick = function() { setActiveTab("home"); };
    document.getElementById("library-create-btn").onclick = function() {
        renderExerciseCreatePage({
            category: selectedCategory,
            onCancel: function() { renderExerciseLibrary(selectedCategory, search.value); },
            onCreated: function(created) { renderExerciseLibrary(created.category); }
        });
    };

    const exercises = await fetchExercises();
    const groupsContainer = document.getElementById("library-groups");
    const pillContainer = document.getElementById("library-pill-row");

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
            onBack: function() { renderExerciseLibrary(selectedCategory, search.value); }
        });
    }

    const search = document.getElementById("library-search");
    search.value = initialQuery || "";
    function renderList() {
        renderLibraryList(groupsContainer, exercises, selectedCategory, onRowClick, search.value);
    }
    function rerender() {
        renderCategoryPillRow(pillContainer, selectedCategory, function(cat) {
            selectedCategory = cat;
            rerender();
        });
        renderList();
    }
    search.oninput = renderList;
    // Return/Search on the keyboard just puts it away.
    search.onkeydown = function(e) { if (e.key === "Enter") search.blur(); };
    rerender();
}
