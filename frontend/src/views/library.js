import {
    fetchExercises,
    createExercise,
    updateExercise,
    deleteExercise
} from "../api.js";
import {
    showExerciseFormModal,
    showExerciseDetailsModal
} from "../components/modals.js";
import { renderCategoryPillRow } from "../components/categoryPills.js";
import { renderLibraryList } from "../components/libraryList.js";
import { setActiveTab, clearNavGuard } from "../components/bottomNav.js";
import { renderExerciseHistoryPage } from "./exerciseHistoryPage.js";

export async function renderExerciseLibrary(initialCategory) {
    clearNavGuard();
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <h2>Exercise Library</h2>
        <div class="page-actions">
            <button id="library-create-btn">Create Exercise</button>
            <button class="btn-secondary" id="library-back-btn">Back</button>
        </div>
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

    async function onRowClick(exercise) {
        const result = await showExerciseDetailsModal(exercise, {
            deleteLabel: "Delete",
            deleteConfirmMessage: `Delete "${exercise.name}" permanently?`,
            history: true
        });
        if (!result) return;
        if (result.action === "history") {
            renderExerciseHistoryPage(exercise, function() { renderExerciseLibrary(selectedCategory); });
        } else if (result.action === "save") {
            await updateExercise(exercise.id, result.data);
            renderExerciseLibrary(result.data.category);
        } else if (result.action === "delete") {
            await deleteExercise(exercise.id);
            renderExerciseLibrary(selectedCategory);
        }
    }

    function rerender() {
        renderCategoryPillRow(pillContainer, selectedCategory, function(cat) {
            selectedCategory = cat;
            rerender();
        });
        renderLibraryList(groupsContainer, exercises, selectedCategory, onRowClick);
    }
    rerender();
}
