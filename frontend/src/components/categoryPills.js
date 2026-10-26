import { CATEGORY_ORDER } from "../config.js";
import { formatCategoryLabel } from "../utils/format.js";
import { pixelArt } from "../utils/pixelArt.js";

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

// One category picked at a time.
export function renderCategoryPillRow(container, selectedCategory, onSelect) {
    container.innerHTML = "";
    for (const cat of ["ALL", ...CATEGORY_ORDER]) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "filter-pill";
        if (cat === selectedCategory) btn.classList.add("selected");
        btn.textContent = cat === "ALL" ? "All" : formatCategoryLabel(cat);
        btn.onclick = function() { onSelect(cat); };
        container.appendChild(btn);
    }
}

// An eye, open (built-ins shown) or closed (hidden).
const EYE_COLORS = { o: "#3B2723", w: "#FFFDF8", n: "#B8665A" };
const EYE_OPEN = pixelArt([
    "....ooooo....",
    "..oowwwwwoo..",
    ".owwwnnnwwwo.",
    "owwwnooonwwwo",
    "owwwnooonwwwo",
    "owwwnooonwwwo",
    ".owwwnnnwwwo.",
    "..oowwwwwoo..",
    "....ooooo....",
], EYE_COLORS, "eye-icon");
const EYE_SHUT = pixelArt([
    ".............",
    ".............",
    ".............",
    "o...........o",
    ".oo.......oo.",
    "...ooooooo...",
    "..o...o...o..",
    ".o....o....o.",
    ".............",
], EYE_COLORS, "eye-icon");

/* The eye on the Create row: built-in exercises shown (open) or hidden
   (closed), so only the user's own show, in whichever category is
   picked and in the search (libraryList.js filterExercises). While hidden,
   `note` under the search box says so. */
export function renderCustomToggle(button, note, customOnly, onToggle) {
    button.innerHTML = customOnly ? EYE_SHUT : EYE_OPEN;
    button.setAttribute("aria-pressed", String(customOnly));
    note.hidden = !customOnly;
    button.onclick = function() { onToggle(!customOnly); };
}
