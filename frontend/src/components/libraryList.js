import { formatCategoryLabel } from "../utils/format.js";
import { groupExercisesByCategory } from "./categoryPills.js";

function buildLibraryRow(exercise, onRowClick) {
    const li = document.createElement("li");
    li.style.cursor = "pointer";
    li.appendChild(document.createTextNode(exercise.name));
    li.onclick = function() { onRowClick(exercise); };
    return li;
}

export function renderLibraryList(container, exercises, selectedCategory, onRowClick) {
    container.innerHTML = "";
    if (exercises.length === 0) {
        container.innerHTML = `<div class="empty-sessions">No exercises yet.</div>`;
        return;
    }

    if (selectedCategory === "ALL") {
        const grouped = groupExercisesByCategory(exercises);
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
        const filtered = exercises.filter(e => (e.category || "CHEST") === selectedCategory);
        if (filtered.length === 0) {
            container.innerHTML = `<div class="empty-sessions">No exercises in ${formatCategoryLabel(selectedCategory)}.</div>`;
            return;
        }
        const ul = document.createElement("ul");
        for (const exercise of filtered) {
            ul.appendChild(buildLibraryRow(exercise, onRowClick));
        }
        container.appendChild(ul);
    }
}
