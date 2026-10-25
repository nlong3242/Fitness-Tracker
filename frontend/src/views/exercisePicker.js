import {
    fetchExercises,
    fetchWorkoutExercises,
    linkExerciseToWorkout
} from "../api.js";
import { findWorkout } from "../state.js";
import { escapeHtml, formatCategoryLabel } from "../utils/format.js";
import { renderExerciseCreatePage } from "./exerciseEdit.js";
import {
    renderCategoryPillRow,
    groupExercisesByCategory
} from "../components/categoryPills.js";
import { filterExercises, exerciseNameHtml, emptyListMessage } from "../components/libraryList.js";
import { viewWorkout } from "./workoutDetail.js";

// kept: { selectedIds, category, query } to start from (back from Create Exercise).
export async function renderMultiSelectExercisePicker(opts, kept) {
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <h2>${escapeHtml(opts.title)}</h2>
        <div class="page-actions">
            <button id="picker-create-btn">Create Exercise</button>
            <button class="btn-secondary" id="picker-cancel-btn">Cancel</button>
        </div>
        <input type="search" id="picker-search" class="library-search" placeholder="Search exercises"
               autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
        <div id="picker-pill-row" class="library-pill-row"></div>
        <div id="picker-list"></div>
        <div class="picker-action-bar">
            <button id="picker-add-btn" disabled>Add 0 to "${escapeHtml(opts.workoutLabel)}"</button>
        </div>
    `;

    const allExercises = await fetchExercises();
    const excludedIds = new Set(opts.excludedIds || []);
    const available = allExercises.filter(e => !excludedIds.has(e.id));

    const pillContainer = document.getElementById("picker-pill-row");
    const listContainer = document.getElementById("picker-list");
    const addBtn = document.getElementById("picker-add-btn");

    let selectedCategory = kept?.category || "ALL";
    const selectedIds = new Set(kept?.selectedIds || []);

    function updateAddBtn() {
        addBtn.disabled = selectedIds.size === 0;
        addBtn.textContent = `Add ${selectedIds.size} to "${opts.workoutLabel}"`;
    }

    function buildSelectableRow(exercise) {
        const row = document.createElement("label");
        row.className = "picker-select-row";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "picker-checkbox";
        checkbox.checked = selectedIds.has(exercise.id);
        checkbox.onchange = function() {
            if (checkbox.checked) selectedIds.add(exercise.id);
            else selectedIds.delete(exercise.id);
            updateAddBtn();
        };
        const nameSpan = document.createElement("span");
        nameSpan.className = "picker-select-name";
        nameSpan.innerHTML = exerciseNameHtml(exercise);
        row.appendChild(checkbox);
        row.appendChild(nameSpan);
        return row;
    }

    function renderList() {
        listContainer.innerHTML = "";
        if (available.length === 0) {
            listContainer.innerHTML = `<div class="empty-sessions">${allExercises.length === 0 ? 'No exercises in your library yet. Click "Create Exercise" to add one.' : 'Every library exercise is already in this workout.'}</div>`;
            return;
        }
        const shown = filterExercises(available, selectedCategory, search.value);
        if (shown.length === 0) {
            listContainer.innerHTML = `<div class="empty-sessions">${emptyListMessage(selectedCategory, search.value)}</div>`;
            return;
        }
        if (selectedCategory === "ALL" || selectedCategory === "CUSTOM") {
            const grouped = groupExercisesByCategory(shown);
            for (const [category, list] of grouped) {
                if (list.length === 0) continue;
                const heading = document.createElement("h3");
                heading.className = "library-group-heading";
                heading.textContent = formatCategoryLabel(category);
                listContainer.appendChild(heading);
                for (const exercise of list) {
                    listContainer.appendChild(buildSelectableRow(exercise));
                }
            }
        } else {
            for (const exercise of shown) {
                listContainer.appendChild(buildSelectableRow(exercise));
            }
        }
    }

    const search = document.getElementById("picker-search");
    search.value = kept?.query || "";
    search.oninput = renderList;
    search.onkeydown = function(e) { if (e.key === "Enter") search.blur(); };

    function rerender() {
        renderCategoryPillRow(pillContainer, selectedCategory, function(cat) {
            selectedCategory = cat;
            rerender();
        });
        renderList();
    }
    rerender();
    updateAddBtn();

    // Create Exercise is a page of its own; coming back redraws the picker
    // with the ticks and filters kept (and a new exercise ticked).
    document.getElementById("picker-create-btn").onclick = function() {
        const kept = { selectedIds: [...selectedIds], category: selectedCategory, query: search.value };
        renderExerciseCreatePage({
            category: selectedCategory,
            onCancel: function() { renderMultiSelectExercisePicker(opts, kept); },
            onCreated: function(created) {
                renderMultiSelectExercisePicker(opts, {
                    selectedIds: [...kept.selectedIds, created.id],
                    category: created.category,
                    query: ""   // so the new one shows
                });
            }
        });
    };

    document.getElementById("picker-cancel-btn").onclick = function() {
        opts.onCancel();
    };

    addBtn.onclick = async function() {
        if (selectedIds.size === 0) return;
        addBtn.disabled = true;
        const selected = available.filter(e => selectedIds.has(e.id));
        await opts.onConfirm(selected);
    };
}

export async function addExercise(workoutId) {
    const workout = findWorkout(workoutId);
    const workoutExercises = await fetchWorkoutExercises(workout.id);
    const excludedIds = workoutExercises.map(e => e.id);
    await renderMultiSelectExercisePicker({
        title: `Add to ${workout.name}`,
        workoutLabel: workout.name,
        excludedIds: excludedIds,
        onCancel: function() { viewWorkout(workoutId); },
        onConfirm: async function(selected) {
            for (const ex of selected) {
                await linkExerciseToWorkout(workout.id, ex.id);
            }
            viewWorkout(workoutId);
        }
    });
}
