import { fetchExercises, createExercise } from "../api.js";
import { showExerciseFormModal } from "../components/modals.js";
import { renderCategoryPillRow } from "../components/categoryPills.js";
import { renderLibraryList } from "../components/libraryList.js";
import { setActiveTab, clearNavGuard } from "../components/bottomNav.js";
import { renderExercisePage } from "./exercisePage.js";
import { setRoute } from "../router.js";

// initialQuery: the search to keep when coming back from an exercise.
export async function renderExerciseLibrary(initialCategory, initialQuery) {
    clearNavGuard();
    setRoute("#/exercises");
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <h2>Exercise Library</h2>
        <div class="page-actions">
            <button id="library-create-btn">Create Exercise</button>
            <button class="btn-secondary" id="library-back-btn">Back</button>
        </div>
        <input type="search" id="library-search" class="library-search" placeholder="Search exercises"
               autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
        <div id="library-pill-row" class="library-pill-row"></div>
        <div id="library-groups"></div>
    `;

    let selectedCategory = initialCategory || "ALL";

    document.getElementById("library-back-btn").onclick = function() { setActiveTab("home"); };
    document.getElementById("library-create-btn").onclick = async function() {
        const data = await showExerciseFormModal(selectedCategory);
        if (!data) return;
        await createExercise(data);
        renderExerciseLibrary(data.category);
    };

    const exercises = await fetchExercises();
    const groupsContainer = document.getElementById("library-groups");
    const pillContainer = document.getElementById("library-pill-row");

    function onRowClick(exercise) {
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
