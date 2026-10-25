import { escapeHtml, formatCategoryLabel } from "../utils/format.js";
import { groupExercisesByCategory } from "./categoryPills.js";

/* The exercises a list shows: those in the chosen pill (a muscle group,
   "ALL", or "CUSTOM" = the user's own) whose name has every word typed in
   the search box, in any order. Used by the library and the picker. */
export function filterExercises(exercises, category, query) {
    const words = (query || "").toLowerCase().split(/\s+/).filter(Boolean);
    return exercises.filter(function(e) {
        if (category === "CUSTOM" && e.builtIn) return false;
        if (category !== "ALL" && category !== "CUSTOM" && (e.category || "CHEST") !== category) return false;
        const name = (e.name || "").toLowerCase();
        return words.every(w => name.includes(w));
    });
}

// The name, with a "Custom" tag on the user's own exercises.
export function exerciseNameHtml(exercise) {
    return `<span class="library-name">${escapeHtml(exercise.name)}</span>`
        + (exercise.builtIn ? "" : `<span class="library-tag">Custom</span>`);
}

// Nothing to show: say why.
export function emptyListMessage(category, query) {
    if (query && query.trim()) return `No exercises match "${escapeHtml(query.trim())}".`;
    if (category === "CUSTOM") return "No Custom exercises yet.";
    if (category !== "ALL") return `No exercises in ${formatCategoryLabel(category)}.`;
    return "No exercises yet.";
}

function buildLibraryRow(exercise, onRowClick) {
    const li = document.createElement("li");
    li.className = "library-row";
    li.style.cursor = "pointer";
    li.innerHTML = exerciseNameHtml(exercise);
    li.onclick = function() { onRowClick(exercise); };
    return li;
}

export function renderLibraryList(container, exercises, selectedCategory, onRowClick, query) {
    container.innerHTML = "";
    const shown = filterExercises(exercises, selectedCategory, query);
    if (shown.length === 0) {
        container.innerHTML = `<div class="empty-sessions">${emptyListMessage(selectedCategory, query)}</div>`;
        return;
    }

    // A single muscle group is one list; everything else is grouped.
    if (selectedCategory === "ALL" || selectedCategory === "CUSTOM") {
        const grouped = groupExercisesByCategory(shown);
        for (const [category, list] of grouped) {
            if (list.length === 0) continue;
            const groupDiv = document.createElement("div");
            groupDiv.className = "library-group";
            const heading = document.createElement("h3");
            heading.className = "library-group-heading";
            heading.textContent = formatCategoryLabel(category);
            groupDiv.appendChild(heading);

            const ul = document.createElement("ul");
            for (const exercise of list) {
                ul.appendChild(buildLibraryRow(exercise, onRowClick));
            }
            groupDiv.appendChild(ul);
            container.appendChild(groupDiv);
        }
    } else {
        const ul = document.createElement("ul");
        for (const exercise of shown) {
            ul.appendChild(buildLibraryRow(exercise, onRowClick));
        }
        container.appendChild(ul);
    }
}
