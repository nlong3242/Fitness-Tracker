import { CATEGORY_ORDER } from "../config.js";
import { formatCategoryLabel } from "../utils/format.js";

export function groupExercisesByCategory(exercises) {
    const groups = new Map();
    for (const cat of CATEGORY_ORDER) groups.set(cat, []);
    for (const ex of exercises) {
        const cat = ex.category || "CHEST";
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat).push(ex);
    }
    return groups;
}

export function renderCategoryPillRow(container, selectedCategory, onSelect) {
    container.innerHTML = "";
    // CUSTOM: only the user's own exercises (libraryList.js filterExercises).
    const pills = ["ALL", ...CATEGORY_ORDER, "CUSTOM"];
    for (const cat of pills) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "filter-pill";
        if (cat === selectedCategory) btn.classList.add("selected");
        btn.textContent = cat === "ALL" ? "All" : cat === "CUSTOM" ? "Custom" : formatCategoryLabel(cat);
        btn.onclick = function() { onSelect(cat); };
        container.appendChild(btn);
    }
}
