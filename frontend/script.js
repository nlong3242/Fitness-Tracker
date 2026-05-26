let workouts = [];
let currentSessionId = null;
let currentSessionDate = null;

function attachLongPressDrag(rowEl, opts) {
    const longPressMs = (opts && opts.longPressMs) || 180;
    const cancelThreshold = (opts && opts.cancelThreshold) || 8;
    const armedMoveThreshold = (opts && opts.armedMoveThreshold) || 5;

    let state = "idle"; // idle | pressing | armed | dragging
    let pressTimer = null;
    let pointerId = null;
    let startX = 0, startY = 0;
    let originRect = null;
    let originIndex = -1;
    let placeholder = null;
    let listEl = null;
    let suppressNextClick = false;

    rowEl.addEventListener("pointerdown", onPointerDown);
    rowEl.addEventListener("click", function(e) {
        if (suppressNextClick) {
            e.stopImmediatePropagation();
            e.preventDefault();
            suppressNextClick = false;
        }
    }, true);
    rowEl.addEventListener("contextmenu", function(e) {
        if (state === "armed" || state === "dragging") e.preventDefault();
    });

    function onPointerDown(e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (e.target.closest("button, input, textarea, select, a")) return;
        pointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        state = "pressing";
        pressTimer = setTimeout(arm, longPressMs);
        rowEl.addEventListener("pointermove", onPointerMove);
        rowEl.addEventListener("pointerup", onPointerUp);
        rowEl.addEventListener("pointercancel", onPointerCancel);
    }

    function onPointerMove(e) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (state === "pressing") {
            if (Math.abs(dx) > cancelThreshold || Math.abs(dy) > cancelThreshold) {
                resetListeners();
            }
        } else if (state === "armed") {
            if (Math.abs(dx) > armedMoveThreshold || Math.abs(dy) > armedMoveThreshold) {
                beginDrag();
                onDragMove(e);
            }
        } else if (state === "dragging") {
            onDragMove(e);
        }
    }

    function onPointerUp() {
        if (state === "dragging") {
            endDrag(true);
        } else {
            // pressing or armed without movement — let click pass through
            resetListeners();
        }
    }

    function onPointerCancel() {
        if (state === "dragging") {
            endDrag(false);
        } else {
            resetListeners();
        }
    }

    function arm() {
        pressTimer = null;
        if (state === "pressing") state = "armed";
    }

    function resetListeners() {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }
        rowEl.removeEventListener("pointermove", onPointerMove);
        rowEl.removeEventListener("pointerup", onPointerUp);
        rowEl.removeEventListener("pointercancel", onPointerCancel);
        state = "idle";
    }

    function beginDrag() {
        state = "dragging";
        listEl = rowEl.parentElement;
        originIndex = Array.from(listEl.children).indexOf(rowEl);
        originRect = rowEl.getBoundingClientRect();

        placeholder = document.createElement(rowEl.tagName);
        placeholder.className = "drag-placeholder";
        placeholder.style.height = rowEl.offsetHeight + "px";
        listEl.insertBefore(placeholder, rowEl);

        rowEl.classList.add("dragging");
        rowEl.style.position = "fixed";
        rowEl.style.left = originRect.left + "px";
        rowEl.style.top = originRect.top + "px";
        rowEl.style.width = originRect.width + "px";
        rowEl.style.margin = "0";
        rowEl.style.zIndex = "1000";
        rowEl.style.pointerEvents = "none";

        suppressNextClick = true;

        try { rowEl.setPointerCapture(pointerId); } catch (_) {}
        document.addEventListener("keydown", onKeyDown);
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
    }

    function onDragMove(e) {
        rowEl.style.left = (originRect.left + (e.clientX - startX)) + "px";
        rowEl.style.top = (originRect.top + (e.clientY - startY)) + "px";

        const siblings = Array.from(listEl.children).filter(c => c !== rowEl && c !== placeholder);
        let insertBeforeNode = null;
        for (const sib of siblings) {
            const r = sib.getBoundingClientRect();
            if (e.clientY < r.top + r.height / 2) {
                insertBeforeNode = sib;
                break;
            }
        }
        if (placeholder.nextSibling !== insertBeforeNode) {
            listEl.insertBefore(placeholder, insertBeforeNode);
        }
    }

    function endDrag(commit) {
        document.removeEventListener("keydown", onKeyDown);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        try { rowEl.releasePointerCapture(pointerId); } catch (_) {}

        let toIndex = originIndex;
        if (commit) {
            const filtered = Array.from(listEl.children).filter(c => c !== rowEl);
            toIndex = filtered.indexOf(placeholder);
        }

        rowEl.classList.remove("dragging");
        rowEl.style.position = "";
        rowEl.style.left = "";
        rowEl.style.top = "";
        rowEl.style.width = "";
        rowEl.style.margin = "";
        rowEl.style.zIndex = "";
        rowEl.style.pointerEvents = "";
        placeholder.remove();
        placeholder = null;

        if (commit && toIndex !== -1 && toIndex !== originIndex) {
            opts.onReorder(originIndex, toIndex);
        }

        setTimeout(function() { suppressNextClick = false; }, 50);
        resetListeners();
    }

    function onKeyDown(e) {
        if (e.key === "Escape" && state === "dragging") endDrag(false);
    }
}

function renderLandingPage() {
    const container = document.getElementById("container");
    container.innerHTML = `
        <div class="landing-hero">
            <h2 class="landing-title">Welcome to Tsu2Track</h2>
            <p class="landing-tagline">Your personal fitness companion</p>
        </div>
        <div class="landing-card-grid">
            <div class="landing-card" id="landing-workouts-card">
                <div class="landing-card-title">Workouts</div>
                <div class="landing-card-desc">View and start your routines</div>
            </div>
            <div class="landing-card" id="landing-library-card">
                <div class="landing-card-title">Exercise Library</div>
                <div class="landing-card-desc">Browse and manage exercises</div>
            </div>
        </div>
    `;
    document.getElementById("landing-workouts-card").onclick = renderWorkouts;
    document.getElementById("landing-library-card").onclick = function() { renderExerciseLibrary(); };
}

function renderWorkouts() {
    let container = document.getElementById("container");
    container.innerHTML = `
        <h2>My Workouts</h2>
        <div class="page-actions">
            <button onclick="renderCreateWorkoutPage()">Create Workout</button>
            <button class="btn-secondary" onclick="renderLandingPage()">Back</button>
        </div>
        <ul id="workout-list">
        </ul>
    `;
    let list = document.getElementById("workout-list");
    for (let i = 0; i < workouts.length; i++) {
        let item = document.createElement("li");
        let nameText = document.createTextNode(workouts[i].name);
        item.style.cursor = "pointer";
        item.onclick = function() {
            viewWorkout(i);
        };

        let deleteBtn = document.createElement("button");
        deleteBtn.textContent = "Delete";
        deleteBtn.onclick = async function(event) {
            event.stopPropagation();
            const confirmed = await showConfirmModal(`Delete workout "${workouts[i].name}"?`, "Delete");
            if (!confirmed) return;
            await fetch(`http://localhost:8080/workouts/${workouts[i].id}`, {
                method: "DELETE"
            });
            workouts.splice(i, 1);
            renderWorkouts();
        };

        item.appendChild(nameText);
        item.appendChild(deleteBtn);
        list.appendChild(item);
    }
}

function renderCreateWorkoutPage(initialState) {
    const state = initialState || { name: "", pendingExercises: [] };
    const container = document.getElementById("container");
    container.innerHTML = `
        <h2>Create Workout</h2>
        <div class="create-workout-form">
            <label for="new-workout-name">Workout Name</label>
            <input type="text" id="new-workout-name" placeholder="Enter workout name">
        </div>
        <h3>Exercises</h3>
        <button id="add-exercise-btn">Add Exercise</button>
        <ul id="pending-exercises-list"></ul>
        <div class="page-actions">
            <button id="save-workout-btn" disabled>Save Workout</button>
            <button class="btn-secondary" id="back-btn">Back</button>
        </div>
    `;

    const nameInput = document.getElementById("new-workout-name");
    const addExerciseBtn = document.getElementById("add-exercise-btn");
    const saveBtn = document.getElementById("save-workout-btn");
    const backBtn = document.getElementById("back-btn");
    const list = document.getElementById("pending-exercises-list");

    nameInput.value = state.name;
    saveBtn.disabled = state.name.trim() === "";

    function renderPendingList() {
        list.innerHTML = "";
        for (let i = 0; i < state.pendingExercises.length; i++) {
            const exercise = state.pendingExercises[i];
            const item = document.createElement("li");
            item.className = "draggable-row";
            item.appendChild(document.createTextNode(`${i + 1}. ${exercise.name}`));
            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "Remove";
            deleteBtn.onclick = function() {
                state.pendingExercises.splice(i, 1);
                renderPendingList();
            };
            item.appendChild(deleteBtn);
            list.appendChild(item);
            if (state.pendingExercises.length > 1) {
                attachLongPressDrag(item, {
                    onReorder: function(from, to) {
                        const [moved] = state.pendingExercises.splice(from, 1);
                        state.pendingExercises.splice(to, 0, moved);
                        renderPendingList();
                    }
                });
            }
        }
    }
    renderPendingList();

    addExerciseBtn.onclick = async function() {
        state.name = nameInput.value;
        const workoutLabel = state.name.trim() || "new workout";
        await renderMultiSelectExercisePicker({
            title: `Add to ${workoutLabel}`,
            workoutLabel: workoutLabel,
            excludedIds: state.pendingExercises.map(e => e.id),
            onCancel: function() { renderCreateWorkoutPage(state); },
            onConfirm: function(selected) {
                state.pendingExercises.push(...selected);
                renderCreateWorkoutPage(state);
            }
        });
    };

    nameInput.oninput = function() {
        saveBtn.disabled = nameInput.value.trim() === "";
    };

    saveBtn.onclick = async function() {
        const name = nameInput.value.trim();
        if (!name) return;
        saveBtn.disabled = true;
        const response = await fetch("http://localhost:8080/workouts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name })
        });
        const newWorkout = await response.json();
        for (const exercise of state.pendingExercises) {
            await fetch(`http://localhost:8080/workouts/${newWorkout.id}/exercises/${exercise.id}/link`, {
                method: "POST"
            });
        }
        workouts.push(newWorkout);
        viewWorkout(workouts.length - 1);
    };

    backBtn.onclick = async function() {
        const hasChanges = nameInput.value.trim() !== "" || state.pendingExercises.length > 0;
        if (hasChanges) {
            const confirmed = await showConfirmModal("Discard this workout?", "Discard");
            if (!confirmed) return;
        }
        renderWorkouts();
    };
}

function showExerciseFormModal(prefilledCategory) {
    return new Promise(function(resolve) {
        const categories = ["CHEST", "ARMS", "BACK", "LEGS", "SHOULDERS", "CORE"];
        const initialCategory = categories.includes(prefilledCategory) ? prefilledCategory : null;
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
            <div class="modal-form-box">
                <div class="modal-form-title">New Exercise</div>
                <div class="modal-field">
                    <label class="modal-field-label">Name <span class="required">*</span></label>
                    <input type="text" id="ex-form-name" placeholder="Enter exercise name">
                </div>
                <div class="modal-field">
                    <label class="modal-field-label">Category <span class="required">*</span></label>
                    <div class="modal-pill-row" id="ex-form-categories"></div>
                </div>
                <div class="modal-field">
                    <label class="modal-field-label">Primary Muscle Groups</label>
                    <input type="text" id="ex-form-muscles" placeholder="e.g. Pectoralis major, Triceps">
                </div>
                <div class="modal-field">
                    <label class="modal-field-label">Exercise Type</label>
                    <input type="text" id="ex-form-type" placeholder="e.g. Compound, Isolation">
                </div>
                <div class="modal-field">
                    <label class="modal-field-label">Cues</label>
                    <textarea id="ex-form-cues" placeholder="Form notes, technique reminders, etc."></textarea>
                </div>
                <div class="modal-field">
                    <label class="modal-field-label">Unilateral</label>
                    <div class="modal-pill-row">
                        <button type="button" class="modal-pill" data-unilateral="yes">Yes</button>
                        <button type="button" class="modal-pill selected" data-unilateral="no">No</button>
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="modal-cancel">Cancel</button>
                    <button class="modal-add" id="ex-form-add" disabled>Add Exercise</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const catRow = overlay.querySelector("#ex-form-categories");
        const nameInput = overlay.querySelector("#ex-form-name");
        const addBtn = overlay.querySelector("#ex-form-add");
        let selectedCategory = initialCategory;
        let unilateral = false;

        function updateAddState() {
            addBtn.disabled = nameInput.value.trim() === "" || selectedCategory === null;
        }

        function formatLabel(c) {
            return c.charAt(0) + c.slice(1).toLowerCase();
        }

        for (const cat of categories) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "modal-pill";
            btn.textContent = formatLabel(cat);
            if (cat === initialCategory) btn.classList.add("selected");
            btn.onclick = function() {
                selectedCategory = cat;
                catRow.querySelectorAll(".modal-pill").forEach(function(b) { b.classList.remove("selected"); });
                btn.classList.add("selected");
                updateAddState();
            };
            catRow.appendChild(btn);
        }

        const uniPills = overlay.querySelectorAll('[data-unilateral]');
        uniPills.forEach(function(btn) {
            btn.onclick = function() {
                unilateral = btn.dataset.unilateral === "yes";
                uniPills.forEach(function(b) { b.classList.remove("selected"); });
                btn.classList.add("selected");
            };
        });

        nameInput.oninput = updateAddState;

        function close(result) {
            document.body.removeChild(overlay);
            resolve(result);
        }

        overlay.querySelector(".modal-cancel").onclick = function() { close(null); };
        addBtn.onclick = function() {
            const name = nameInput.value.trim();
            if (!name || !selectedCategory) return;
            const muscles = overlay.querySelector("#ex-form-muscles").value.trim();
            const type = overlay.querySelector("#ex-form-type").value.trim();
            const cues = overlay.querySelector("#ex-form-cues").value.trim();
            close({
                name: name,
                category: selectedCategory,
                primaryMuscleGroups: muscles || null,
                exerciseType: type || null,
                cues: cues || null,
                unilateral: unilateral
            });
        };

        nameInput.focus();
    });
}

function showExerciseDetailsModal(exercise, options) {
    options = options || {};
    const deleteLabel = options.deleteLabel || "Delete";
    const deleteConfirmMessage = options.deleteConfirmMessage || `Delete exercise "${exercise.name}"?`;
    return new Promise(function(resolve) {
        const categories = ["CHEST", "ARMS", "BACK", "LEGS", "SHOULDERS", "CORE"];
        const original = {
            name: exercise.name || "",
            category: exercise.category || null,
            primaryMuscleGroups: exercise.primaryMuscleGroups || "",
            exerciseType: exercise.exerciseType || "",
            cues: exercise.cues || "",
            unilateral: exercise.unilateral === true
        };

        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
            <div class="modal-form-box">
                <div class="modal-form-title">Exercise Details</div>
                <div class="modal-field">
                    <label class="modal-field-label">Name <span class="required">*</span></label>
                    <input type="text" id="ex-edit-name" placeholder="Enter exercise name">
                </div>
                <div class="modal-field">
                    <label class="modal-field-label">Category <span class="required">*</span></label>
                    <div class="modal-pill-row" id="ex-edit-categories"></div>
                </div>
                <div class="modal-field">
                    <label class="modal-field-label">Primary Muscle Groups</label>
                    <input type="text" id="ex-edit-muscles" placeholder="None">
                </div>
                <div class="modal-field">
                    <label class="modal-field-label">Exercise Type</label>
                    <input type="text" id="ex-edit-type" placeholder="None">
                </div>
                <div class="modal-field">
                    <label class="modal-field-label">Cues</label>
                    <textarea id="ex-edit-cues" placeholder="None"></textarea>
                </div>
                <div class="modal-field">
                    <label class="modal-field-label">Unilateral</label>
                    <div class="modal-pill-row">
                        <button type="button" class="modal-pill" data-unilateral="yes">Yes</button>
                        <button type="button" class="modal-pill" data-unilateral="no">No</button>
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="modal-cancel">Cancel</button>
                    <button class="modal-delete" id="ex-edit-delete"></button>
                    <button class="modal-add" id="ex-edit-save" disabled>Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const nameInput = overlay.querySelector("#ex-edit-name");
        const musclesInput = overlay.querySelector("#ex-edit-muscles");
        const typeInput = overlay.querySelector("#ex-edit-type");
        const cuesInput = overlay.querySelector("#ex-edit-cues");
        const catRow = overlay.querySelector("#ex-edit-categories");
        const saveBtn = overlay.querySelector("#ex-edit-save");
        const deleteBtn = overlay.querySelector("#ex-edit-delete");
        deleteBtn.textContent = deleteLabel;
        const cancelBtn = overlay.querySelector(".modal-cancel");

        nameInput.value = original.name;
        musclesInput.value = original.primaryMuscleGroups;
        typeInput.value = original.exerciseType;
        cuesInput.value = original.cues;

        let selectedCategory = original.category;
        let unilateral = original.unilateral;

        function currentValues() {
            return {
                name: nameInput.value,
                category: selectedCategory,
                primaryMuscleGroups: musclesInput.value,
                exerciseType: typeInput.value,
                cues: cuesInput.value,
                unilateral: unilateral
            };
        }

        function isDirty() {
            const cur = currentValues();
            return cur.name !== original.name
                || cur.category !== original.category
                || cur.primaryMuscleGroups !== original.primaryMuscleGroups
                || cur.exerciseType !== original.exerciseType
                || cur.cues !== original.cues
                || cur.unilateral !== original.unilateral;
        }

        function updateSaveState() {
            saveBtn.disabled = !(isDirty() && nameInput.value.trim() !== "" && selectedCategory !== null);
        }

        for (const cat of categories) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "modal-pill";
            btn.textContent = formatCategoryLabel(cat);
            if (cat === selectedCategory) btn.classList.add("selected");
            btn.onclick = function() {
                selectedCategory = cat;
                catRow.querySelectorAll(".modal-pill").forEach(function(b) { b.classList.remove("selected"); });
                btn.classList.add("selected");
                updateSaveState();
            };
            catRow.appendChild(btn);
        }

        const uniPills = overlay.querySelectorAll('[data-unilateral]');
        uniPills.forEach(function(btn) {
            const isYes = btn.dataset.unilateral === "yes";
            if (isYes === unilateral) btn.classList.add("selected");
            btn.onclick = function() {
                unilateral = isYes;
                uniPills.forEach(function(b) { b.classList.remove("selected"); });
                btn.classList.add("selected");
                updateSaveState();
            };
        });

        nameInput.oninput = updateSaveState;
        musclesInput.oninput = updateSaveState;
        typeInput.oninput = updateSaveState;
        cuesInput.oninput = updateSaveState;

        function close(result) {
            document.body.removeChild(overlay);
            resolve(result);
        }

        cancelBtn.onclick = async function() {
            if (!isDirty()) {
                close(null);
                return;
            }
            const requiredEmpty = nameInput.value.trim() === "" || selectedCategory === null;
            const message = requiredEmpty
                ? "Required field is empty. Discard changes?"
                : "Discard unsaved changes?";
            const confirmed = await showConfirmModal(message, "Discard");
            if (confirmed) close(null);
        };

        deleteBtn.onclick = async function() {
            const confirmed = await showConfirmModal(deleteConfirmMessage, deleteLabel);
            if (confirmed) close({ action: "delete" });
        };

        saveBtn.onclick = function() {
            const name = nameInput.value.trim();
            if (!name || !selectedCategory) return;
            const muscles = musclesInput.value.trim();
            const type = typeInput.value.trim();
            const cues = cuesInput.value.trim();
            close({
                action: "save",
                data: {
                    name: name,
                    category: selectedCategory,
                    primaryMuscleGroups: muscles || null,
                    exerciseType: type || null,
                    cues: cues || null,
                    unilateral: unilateral
                }
            });
        };

        nameInput.focus();
    });
}

function formatCategoryLabel(c) {
    if (!c) return "";
    return c.charAt(0) + c.slice(1).toLowerCase();
}

function showExerciseReadOnlyModal(exercise) {
    return new Promise(function(resolve) {
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        const rows = [
            ["Name", exercise.name],
            ["Category", formatCategoryLabel(exercise.category)],
            ["Primary Muscle Groups", exercise.primaryMuscleGroups],
            ["Exercise Type", exercise.exerciseType],
            ["Cues", exercise.cues],
            ["Unilateral", exercise.unilateral === true ? "Yes" : "No"]
        ];
        let rowsHtml = "";
        for (const [label, value] of rows) {
            const display = value === null || value === undefined || value === ""
                ? `<span class="modal-readonly-empty">None</span>`
                : escapeHtml(String(value));
            rowsHtml += `
                <div class="modal-readonly-row">
                    <div class="modal-readonly-label">${label}</div>
                    <div class="modal-readonly-value">${display}</div>
                </div>
            `;
        }
        overlay.innerHTML = `
            <div class="modal-form-box">
                <div class="modal-form-title">Exercise Details</div>
                ${rowsHtml}
                <div class="modal-actions">
                    <button class="modal-cancel">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector(".modal-cancel").onclick = function() {
            document.body.removeChild(overlay);
            resolve();
        };
    });
}

function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function(c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
}

const CATEGORY_ORDER = ["CHEST", "ARMS", "BACK", "LEGS", "SHOULDERS", "CORE"];

function groupExercisesByCategory(exercises) {
    const groups = new Map();
    for (const cat of CATEGORY_ORDER) groups.set(cat, []);
    for (const ex of exercises) {
        const cat = ex.category || "CHEST";
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat).push(ex);
    }
    return groups;
}

function renderCategoryPillRow(container, selectedCategory, onSelect) {
    container.innerHTML = "";
    const pills = ["ALL", ...CATEGORY_ORDER];
    for (const cat of pills) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "filter-pill";
        if (cat === selectedCategory) btn.classList.add("selected");
        btn.textContent = cat === "ALL" ? "All" : formatCategoryLabel(cat);
        btn.onclick = function() { onSelect(cat); };
        container.appendChild(btn);
    }
}

function renderLibraryList(container, exercises, selectedCategory, onRowClick) {
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

function buildLibraryRow(exercise, onRowClick) {
    const li = document.createElement("li");
    li.style.cursor = "pointer";
    li.appendChild(document.createTextNode(exercise.name));
    li.onclick = function() { onRowClick(exercise); };
    return li;
}

async function renderExerciseLibrary(initialCategory) {
    const container = document.getElementById("container");
    container.innerHTML = `
        <h2>Exercise Library</h2>
        <div class="page-actions">
            <button id="library-create-btn">Create Exercise</button>
            <button class="btn-secondary" id="library-back-btn">Back</button>
        </div>
        <div id="library-pill-row" class="library-pill-row"></div>
        <div id="library-groups"></div>
    `;

    document.getElementById("library-back-btn").onclick = renderLandingPage;
    document.getElementById("library-create-btn").onclick = async function() {
        const data = await showExerciseFormModal(selectedCategory);
        if (!data) return;
        await fetch("http://localhost:8080/exercises", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });
        renderExerciseLibrary(data.category);
    };

    const response = await fetch("http://localhost:8080/exercises");
    const exercises = await response.json();
    const groupsContainer = document.getElementById("library-groups");
    const pillContainer = document.getElementById("library-pill-row");

    let selectedCategory = initialCategory || "ALL";

    async function onRowClick(exercise) {
        const result = await showExerciseDetailsModal(exercise, {
            deleteLabel: "Delete",
            deleteConfirmMessage: `Delete "${exercise.name}" permanently?`
        });
        if (!result) return;
        if (result.action === "save") {
            await fetch(`http://localhost:8080/exercises/${exercise.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(result.data)
            });
            renderExerciseLibrary(result.data.category);
        } else if (result.action === "delete") {
            await fetch(`http://localhost:8080/exercises/${exercise.id}`, { method: "DELETE" });
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

async function ensureCurrentSession(workout) {
    if (currentSessionId === null) {
        const response = await fetch(`http://localhost:8080/workouts/${workout.id}/sessions`, { method: "POST" });
        const session = await response.json();
        currentSessionId = session.id;
        currentSessionDate = session.date;
    }
    return currentSessionId;
}

async function maybeCleanupOrphanSession(workout) {
    let hasAnySets = false;
    for (const ex of workout.exercises) {
        if (ex.sets && ex.sets.length > 0) {
            hasAnySets = true;
            break;
        }
    }
    if (!hasAnySets && currentSessionId !== null) {
        await fetch(`http://localhost:8080/sessions/${currentSessionId}`, { method: "DELETE" });
        currentSessionId = null;
        currentSessionDate = null;
    }
}

function createNotesPanel(exercise) {
    const wrapper = document.createElement("div");
    wrapper.className = "notes-wrapper";

    const addBtn = document.createElement("button");
    addBtn.className = "notes-toggle-btn";
    addBtn.textContent = "Add Notes";

    const box = document.createElement("div");
    box.className = "notes-box";

    const panel = document.createElement("div");
    panel.className = "notes-panel";
    panel.innerHTML = `
        <textarea class="notes-textarea" placeholder="Type notes here..."></textarea>
        <div class="notes-actions">
            <button class="notes-cancel">Cancel</button>
            <button class="notes-save">Save</button>
        </div>
    `;
    const textarea = panel.querySelector(".notes-textarea");
    const saveBtn = panel.querySelector(".notes-save");
    const cancelBtn = panel.querySelector(".notes-cancel");

    let originalContent = "";

    function hasNote() {
        return exercise.notes != null && exercise.notes !== "";
    }

    function refreshDisplay() {
        if (hasNote()) {
            addBtn.style.display = "none";
            box.style.display = "block";
            box.textContent = exercise.notes;
        } else {
            addBtn.style.display = "";
            box.style.display = "none";
        }
        panel.style.display = "none";
    }

    function openEdit() {
        const content = exercise.notes || "";
        textarea.value = content;
        originalContent = content;
        addBtn.style.display = "none";
        box.style.display = "none";
        panel.style.display = "block";
        textarea.focus();
    }

    addBtn.onclick = openEdit;
    box.onclick = openEdit;

    cancelBtn.onclick = async function() {
        if (textarea.value !== originalContent) {
            const confirmed = await showConfirmModal("Discard unsaved notes?", "Discard");
            if (!confirmed) return;
        }
        refreshDisplay();
    };

    saveBtn.onclick = async function() {
        const content = textarea.value;
        const response = await fetch(`http://localhost:8080/exercises/${exercise.id}/note`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: content })
        });
        const updated = await response.json();
        exercise.notes = updated.notes || "";
        refreshDisplay();
    };

    wrapper.appendChild(addBtn);
    wrapper.appendChild(box);
    wrapper.appendChild(panel);
    refreshDisplay();
    return wrapper;
}

function showConfirmModal(message, confirmLabel) {
    return new Promise(function(resolve) {
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
            <div class="modal-box">
                <div class="modal-message"></div>
                <div class="modal-actions">
                    <button class="modal-cancel">Cancel</button>
                    <button class="modal-confirm"></button>
                </div>
            </div>
        `;
        overlay.querySelector(".modal-message").textContent = message;
        overlay.querySelector(".modal-confirm").textContent = confirmLabel;
        document.body.appendChild(overlay);

        function close(result) {
            document.body.removeChild(overlay);
            resolve(result);
        }
        overlay.querySelector(".modal-cancel").onclick = function() { close(false); };
        overlay.querySelector(".modal-confirm").onclick = function() { close(true); };
    });
}

 async function viewWorkout(workoutIndex) {
    const workout = workouts[workoutIndex];
    const response = await fetch(`http://localhost:8080/workouts/${workout.id}/exercises`);
    const data = await response.json();
    workout.exercises = data;
    let container = document.getElementById("container");
    container.innerHTML = `
    <h2>${workout.name}</h2>
    <div class="page-actions">
        <button onclick="addExercise(${workoutIndex})">Add Exercise</button>
        <button onclick="startWorkout(${workoutIndex})">Start Workout</button>
    </div>
    <ul id="exercise-list">
    </ul>
    <h3 class="library-group-heading">Previous Sessions</h3>
    <div id="session-list"></div>
    <button id="load-more-sessions" style="display:none">Load More</button>
    <div class="page-actions">
        <button class="btn-secondary" onclick="renderWorkouts()">Back</button>
    </div>
`;

    const list = document.getElementById("exercise-list");

    function rebuildExerciseList() {
        list.innerHTML = "";
        for (let i = 0; i < workout.exercises.length; i++) {
            const exercise = workout.exercises[i];
            const item = document.createElement("li");
            item.className = "exercise-row draggable-row";
            item.style.cursor = "pointer";
            item.appendChild(document.createTextNode(`${i + 1}. ${exercise.name}`));
            item.onclick = async function() {
                const result = await showExerciseDetailsModal(exercise, {
                    deleteLabel: "Remove",
                    deleteConfirmMessage: `Remove "${exercise.name}" from "${workout.name}"?`
                });
                if (!result) return;
                if (result.action === "save") {
                    await fetch(`http://localhost:8080/workouts/${workout.id}/exercises/${exercise.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(result.data)
                    });
                    viewWorkout(workoutIndex);
                } else if (result.action === "delete") {
                    await fetch(`http://localhost:8080/workouts/${workout.id}/exercises/${exercise.id}`, {
                        method: "DELETE"
                    });
                    viewWorkout(workoutIndex);
                }
            };
            list.appendChild(item);
            if (workout.exercises.length > 1) {
                attachLongPressDrag(item, {
                    onReorder: async function(from, to) {
                        const [moved] = workout.exercises.splice(from, 1);
                        workout.exercises.splice(to, 0, moved);
                        rebuildExerciseList();
                        const orderedExerciseIds = workout.exercises.map(e => e.id);
                        const resp = await fetch(`http://localhost:8080/workouts/${workout.id}/exercises/order`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ orderedExerciseIds: orderedExerciseIds })
                        });
                        if (!resp.ok) {
                            const [back] = workout.exercises.splice(to, 1);
                            workout.exercises.splice(from, 0, back);
                            rebuildExerciseList();
                            await showConfirmModal("Couldn't save the new order.", "OK");
                        }
                    }
                });
            }
        }
    }
    rebuildExerciseList();

    let nextPage = 0;
    let sessionIndex = 1;
    const loadMoreBtn = document.getElementById("load-more-sessions");
    const sessionList = document.getElementById("session-list");

    async function loadSessionPage() {
        const pageResponse = await fetch(`http://localhost:8080/workouts/${workout.id}/sessions?page=${nextPage}&size=5`);
        const pageData = await pageResponse.json();
        if (nextPage === 0 && pageData.content.length === 0) {
            sessionList.innerHTML = `<div class="empty-sessions">No previous sessions yet.</div>`;
            return;
        }
        for (const session of pageData.content) {
            const row = document.createElement("div");
            row.className = "session-row";
            const [y, m, d] = session.date.split("-").map(Number);
            const formatted = new Date(y, m - 1, d).toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric"
            });
            row.innerHTML = `<span class="session-index">${sessionIndex}.</span> ${formatted}`;
            row.onclick = function() {
                viewSessionSummary(workoutIndex, session.id, session.date);
            };
            sessionList.appendChild(row);
            sessionIndex++;
        }
        nextPage++;
        loadMoreBtn.style.display = pageData.last ? "none" : "inline-block";
    }

    loadMoreBtn.onclick = loadSessionPage;
    await loadSessionPage();
}

async function addExercise(workoutIndex) {
    const workout = workouts[workoutIndex];
    const wxResponse = await fetch(`http://localhost:8080/workouts/${workout.id}/exercises`);
    const workoutExercises = await wxResponse.json();
    const excludedIds = workoutExercises.map(e => e.id);
    await renderMultiSelectExercisePicker({
        title: `Add to ${workout.name}`,
        workoutLabel: workout.name,
        excludedIds: excludedIds,
        onCancel: function() { viewWorkout(workoutIndex); },
        onConfirm: async function(selected) {
            for (const ex of selected) {
                await fetch(`http://localhost:8080/workouts/${workout.id}/exercises/${ex.id}/link`, {
                    method: "POST"
                });
            }
            viewWorkout(workoutIndex);
        }
    });
}

async function renderMultiSelectExercisePicker(opts) {
    const container = document.getElementById("container");
    container.innerHTML = `
        <h2>${escapeHtml(opts.title)}</h2>
        <div class="page-actions">
            <button id="picker-create-btn">Create Exercise</button>
            <button class="btn-secondary" id="picker-cancel-btn">Cancel</button>
        </div>
        <div id="picker-pill-row" class="library-pill-row"></div>
        <div id="picker-list"></div>
        <div class="picker-action-bar">
            <button id="picker-add-btn" disabled>Add 0 to "${escapeHtml(opts.workoutLabel)}"</button>
        </div>
    `;

    const libResponse = await fetch("http://localhost:8080/exercises");
    const allExercises = await libResponse.json();
    const excludedIds = new Set(opts.excludedIds || []);
    const available = allExercises.filter(e => !excludedIds.has(e.id));

    const pillContainer = document.getElementById("picker-pill-row");
    const listContainer = document.getElementById("picker-list");
    const addBtn = document.getElementById("picker-add-btn");

    let selectedCategory = "ALL";
    const selectedIds = new Set();

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
        nameSpan.textContent = exercise.name;
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
        if (selectedCategory === "ALL") {
            const grouped = groupExercisesByCategory(available);
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
            const filtered = available.filter(e => (e.category || "CHEST") === selectedCategory);
            if (filtered.length === 0) {
                listContainer.innerHTML = `<div class="empty-sessions">No exercises in ${formatCategoryLabel(selectedCategory)}.</div>`;
                return;
            }
            for (const exercise of filtered) {
                listContainer.appendChild(buildSelectableRow(exercise));
            }
        }
    }

    function rerender() {
        renderCategoryPillRow(pillContainer, selectedCategory, function(cat) {
            selectedCategory = cat;
            rerender();
        });
        renderList();
    }
    rerender();
    updateAddBtn();

    document.getElementById("picker-create-btn").onclick = async function() {
        const data = await showExerciseFormModal(selectedCategory);
        if (!data) return;
        const response = await fetch("http://localhost:8080/exercises", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });
        const created = await response.json();
        available.push(created);
        selectedIds.add(created.id);
        selectedCategory = created.category || "CHEST";
        rerender();
        updateAddBtn();
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

async function startWorkout(workoutIndex) {
    const workout = workouts[workoutIndex];
    // Get the exercises of this workout from DB
    const exerciseResponse = await fetch(`http://localhost:8080/workouts/${workout.id}/exercises`);
    const exercises = await exerciseResponse.json();
    exercises.forEach(ex => ex.sets = []);
    workout.exercises = exercises;

    // Session is created lazily — only when the first set is logged
    currentSessionId = null;
    currentSessionDate = null;

    let container = document.getElementById("container");
    container.innerHTML = `
        <h2>${workout.name} - Workout</h2>
        <div id="exercise-cards"></div>
        <div class="page-actions">
            <button onclick="finishWorkout(${workoutIndex})">Finish Workout</button>
        </div>
    `;

    let cards = document.getElementById("exercise-cards");
    for (let i = 0; i < workout.exercises.length; i++) {
        let exercise = workout.exercises[i];
        const isUnilateral = exercise.unilateral === true;

        const lastSetsResponse = await fetch(`http://localhost:8080/workouts/${workout.id}/exercises/${exercise.id}/last-sets`);
        exercise.previousSets = await lastSetsResponse.json();
        if (isUnilateral) {
            exercise.previousLSets = exercise.previousSets.filter(s => s.side === "LEFT");
            exercise.previousRSets = exercise.previousSets.filter(s => s.side === "RIGHT");
        }

        let card = document.createElement("div");
        card.className = "exercise-card draggable-row";
        card.innerHTML = `
            <h3 class="exercise-card-title">${exercise.name}</h3>
            <div id="sets-${i}"></div>
        `;
        card.querySelector(".exercise-card-title").onclick = function() {
            showExerciseReadOnlyModal(exercise);
        };

        let addSetBtn = document.createElement("button");
        addSetBtn.textContent = "Add Set";
        addSetBtn.onclick = function() {
            const container = document.getElementById("sets-" + i);
            if (isUnilateral) {
                container.appendChild(createInputRow(workout, exercise, i, "LEFT"));
                container.appendChild(createInputRow(workout, exercise, i, "RIGHT"));
            } else {
                container.appendChild(createInputRow(workout, exercise, i, null));
            }
            updateHeaderVisibility(i);
            renumberSetRows(i, exercise);
        };

        card.appendChild(addSetBtn);
        card.appendChild(createNotesPanel(exercise));

        cards.appendChild(card);

        const container = document.getElementById("sets-" + i);
        if (isUnilateral) {
            const pairCount = Math.max(exercise.previousLSets.length, exercise.previousRSets.length);
            for (let k = 0; k < pairCount; k++) {
                container.appendChild(createInputRow(workout, exercise, i, "LEFT"));
                container.appendChild(createInputRow(workout, exercise, i, "RIGHT"));
            }
        } else {
            for (let k = 0; k < exercise.previousSets.length; k++) {
                container.appendChild(createInputRow(workout, exercise, i, null));
            }
        }
        updateHeaderVisibility(i);
        renumberSetRows(i, exercise);

        if (workout.exercises.length > 1) {
            attachLongPressDrag(card, {
                onReorder: function(from, to) {
                    const [moved] = workout.exercises.splice(from, 1);
                    workout.exercises.splice(to, 0, moved);
                    const cardEl = cards.children[from];
                    cards.removeChild(cardEl);
                    const refNode = cards.children[to] || null;
                    cards.insertBefore(cardEl, refNode);
                }
            });
        }
    }
}

function createInputRow(workout, exercise, exerciseIndex, side) {
    const isUnilateral = exercise.unilateral === true;
    const row = document.createElement("div");
    row.className = "set-input-row";
    if (side) row.dataset.side = side;
    row._savedSet = null;
    row.innerHTML = `
        <div class="set-input-num"></div>
        <div class="set-input-cell">
            <input type="number" min="0" step="0.5" inputmode="decimal" class="set-input weight-input">
            <span class="set-input-delta weight-delta"></span>
        </div>
        <div class="set-input-cell">
            <input type="number" min="1" step="1" inputmode="numeric" class="set-input reps-input">
            <span class="set-input-delta reps-delta"></span>
        </div>
        <button class="set-input-cancel">&#10005;</button>
    `;
    const weightInput = row.querySelector(".weight-input");
    const repsInput = row.querySelector(".reps-input");
    const weightDelta = row.querySelector(".weight-delta");
    const repsDelta = row.querySelector(".reps-delta");
    const cancelBtn = row.querySelector(".set-input-cancel");
    let persisting = false;

    function disableWheelScroll(input) {
        input.addEventListener("wheel", function() { this.blur(); });
    }
    disableWheelScroll(weightInput);
    disableWheelScroll(repsInput);

    function renderDeltaSpan(el, delta) {
        if (delta === 0) {
            el.textContent = "";
            el.classList.remove("pos", "neg");
            return;
        }
        const sign = delta > 0 ? "+" : "";
        el.textContent = `${sign}${delta}`;
        el.classList.toggle("pos", delta > 0);
        el.classList.toggle("neg", delta < 0);
    }

    function lookupPrev() {
        const container = document.getElementById("sets-" + exerciseIndex);
        const rows = Array.from(container.children).filter(c => !c.classList.contains("set-header-row"));
        if (isUnilateral) {
            const sameSide = rows.filter(r => r.dataset.side === side);
            const position = sameSide.indexOf(row) + 1;
            const prevList = side === "LEFT" ? exercise.previousLSets : exercise.previousRSets;
            return prevList[position - 1];
        } else {
            const position = rows.indexOf(row) + 1;
            return exercise.previousSets[position - 1];
        }
    }

    function updateDeltas() {
        const prev = lookupPrev();
        if (!prev) {
            weightDelta.textContent = "";
            repsDelta.textContent = "";
            weightDelta.classList.remove("pos", "neg");
            repsDelta.classList.remove("pos", "neg");
            return;
        }
        const w = parseFloat(weightInput.value);
        const r = parseInt(repsInput.value);
        if (isNaN(w)) {
            weightDelta.textContent = "";
            weightDelta.classList.remove("pos", "neg");
        } else {
            renderDeltaSpan(weightDelta, w - prev.weight);
        }
        if (isNaN(r)) {
            repsDelta.textContent = "";
            repsDelta.classList.remove("pos", "neg");
        } else {
            renderDeltaSpan(repsDelta, r - prev.reps);
        }
    }

    row._updateDeltas = updateDeltas;

    function refreshSavedClass() {
        if (!row._savedSet) return;
        const w = parseFloat(weightInput.value);
        const r = Number(repsInput.value);
        const matches = w === row._savedSet.weight && r === row._savedSet.reps;
        row.classList.toggle("saved", matches);
    }

    function onInputChange() {
        updateDeltas();
        refreshSavedClass();
    }

    weightInput.oninput = onInputChange;
    repsInput.oninput = onInputChange;

    async function persist() {
        if (persisting) return;
        const w = parseFloat(weightInput.value);
        const r = Number(repsInput.value);
        if (isNaN(w) || w < 0) return;
        if (!Number.isInteger(r) || r <= 0) return;
        if (row._savedSet && w === row._savedSet.weight && r === row._savedSet.reps) return;
        persisting = true;
        try {
            if (row._savedSet) {
                const response = await fetch(`http://localhost:8080/sets/${row._savedSet.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ weight: w, reps: r })
                });
                const updated = await response.json();
                row._savedSet.weight = updated.weight;
                row._savedSet.reps = updated.reps;
                row.classList.add("saved");
            } else {
                await ensureCurrentSession(workout);
                const body = { weight: w, reps: r };
                if (side) body.side = side;
                const response = await fetch(`http://localhost:8080/sessions/${currentSessionId}/sets?exerciseId=${exercise.id}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body)
                });
                row._savedSet = await response.json();
                exercise.sets.push(row._savedSet);
                row.classList.add("saved");
            }
        } finally {
            persisting = false;
        }
    }

    weightInput.onchange = persist;
    repsInput.onchange = persist;

    async function deleteRowSet(r) {
        if (r._savedSet) {
            await fetch(`http://localhost:8080/sets/${r._savedSet.id}`, { method: "DELETE" });
            const idx = exercise.sets.indexOf(r._savedSet);
            if (idx >= 0) exercise.sets.splice(idx, 1);
        }
        r.remove();
    }

    cancelBtn.onclick = async function() {
        if (isUnilateral) {
            const container = document.getElementById("sets-" + exerciseIndex);
            const rows = Array.from(container.children).filter(c => !c.classList.contains("set-header-row"));
            const sameSide = rows.filter(r => r.dataset.side === side);
            const position = sameSide.indexOf(row) + 1;
            const otherSide = side === "LEFT" ? "RIGHT" : "LEFT";
            const otherSideRows = rows.filter(r => r.dataset.side === otherSide);
            const partnerRow = otherSideRows[position - 1] || null;
            await deleteRowSet(row);
            if (partnerRow) await deleteRowSet(partnerRow);
        } else {
            await deleteRowSet(row);
        }
        await maybeCleanupOrphanSession(workout);
        updateHeaderVisibility(exerciseIndex);
        renumberSetRows(exerciseIndex, exercise);
    };

    return row;
}

function updateHeaderVisibility(exerciseIndex) {
    const container = document.getElementById("sets-" + exerciseIndex);
    const existingHeader = container.querySelector(".set-header-row");
    const hasRows = Array.from(container.children).some(c => !c.classList.contains("set-header-row"));
    if (hasRows && !existingHeader) {
        container.insertBefore(createHeaderRow(), container.firstChild);
    } else if (!hasRows && existingHeader) {
        existingHeader.remove();
    }
}

function createHeaderRow() {
    const row = document.createElement("div");
    row.className = "set-header-row";
    row.innerHTML = `
        <div class="set-input-num"></div>
        <div class="set-header-cell">Weight</div>
        <div class="set-header-cell">Reps</div>
    `;
    return row;
}

function renumberSetRows(exerciseIndex, exercise) {
    const container = document.getElementById("sets-" + exerciseIndex);
    const isUnilateral = exercise.unilateral === true;
    if (isUnilateral) {
        let leftCount = 0;
        let rightCount = 0;
        for (const child of container.children) {
            if (child.classList.contains("set-header-row")) continue;
            const side = child.dataset.side;
            let label, prev;
            if (side === "LEFT") {
                leftCount++;
                label = `Set L${leftCount}`;
                prev = exercise.previousLSets[leftCount - 1];
            } else {
                rightCount++;
                label = `Set R${rightCount}`;
                prev = exercise.previousRSets[rightCount - 1];
            }
            const numEl = child.querySelector(".set-num, .set-input-num");
            if (numEl) numEl.textContent = label;
            const weightInput = child.querySelector("input.weight-input");
            const repsInput = child.querySelector("input.reps-input");
            if (weightInput && repsInput) {
                weightInput.placeholder = prev ? prev.weight : "";
                repsInput.placeholder = prev ? prev.reps : "";
            }
            if (child._updateDeltas) child._updateDeltas();
        }
    } else {
        let position = 0;
        for (const child of container.children) {
            if (child.classList.contains("set-header-row")) continue;
            position++;
            const label = `Set ${String(position).padStart(2, "0")}`;
            const numEl = child.querySelector(".set-num, .set-input-num");
            if (numEl) numEl.textContent = label;
            const weightInput = child.querySelector("input.weight-input");
            const repsInput = child.querySelector("input.reps-input");
            if (weightInput && repsInput) {
                const prev = exercise.previousSets[position - 1];
                weightInput.placeholder = prev ? prev.weight : "";
                repsInput.placeholder = prev ? prev.reps : "";
            }
            if (child._updateDeltas) child._updateDeltas();
        }
    }
}

async function loadWorkouts() {
    const response = await fetch("http://localhost:8080/workouts");
    const data = await response.json();
    workouts = data;
    renderLandingPage();
}

async function finishWorkout(workoutIndex) {
    const workout = workouts[workoutIndex];
    if (currentSessionId === null) {
        renderWorkouts();
        return;
    }
    const sessionId = currentSessionId;
    const sessionDate = currentSessionDate;
    currentSessionId = null;
    currentSessionDate = null;
    await fetch(`http://localhost:8080/sessions/${sessionId}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedExerciseIds: workout.exercises.map(e => e.id) })
    });
    await renderWorkoutSummary(workout, sessionId, sessionDate, "renderWorkouts()");
}

async function viewSessionSummary(workoutIndex, sessionId, sessionDate) {
    const workout = workouts[workoutIndex];

    const snapshotResponse = await fetch(`http://localhost:8080/sessions/${sessionId}/exercises`);
    const snapshotExercises = await snapshotResponse.json();

    const setsResponse = await fetch(`http://localhost:8080/sessions/${sessionId}/sets`);
    const sets = await setsResponse.json();
    const setsByExerciseId = new Map();
    for (const set of sets) {
        if (!setsByExerciseId.has(set.exerciseId)) {
            setsByExerciseId.set(set.exerciseId, []);
        }
        setsByExerciseId.get(set.exerciseId).push(set);
    }

    for (const snapshot of snapshotExercises) {
        snapshot.id = snapshot.exerciseId;
        snapshot.sets = setsByExerciseId.get(snapshot.exerciseId) || [];
    }
    workout.exercises = snapshotExercises;

    await renderWorkoutSummary(workout, sessionId, sessionDate, `viewWorkout(${workoutIndex})`);
}

function deltaSpan(delta) {
    if (delta === 0) return "";
    const sign = delta > 0 ? "+" : "";
    const cls = delta > 0 ? "pos" : "neg";
    return ` <span class="delta ${cls}">(${sign}${delta})</span>`;
}

async function renderWorkoutSummary(workout, sessionId, sessionDate, backOnClick) {
    let exercisesCount = 0;
    let setsCount = 0;
    let repsTotal = 0;
    let volumeTotal = 0;
    for (const exercise of workout.exercises) {
        if (exercise.sets.length > 0) {
            exercisesCount++;
        }
        for (const set of exercise.sets) {
            setsCount++;
            repsTotal += set.reps;
            volumeTotal += set.weight * set.reps;
        }
    }

    const [year, month, day] = sessionDate.split("-").map(Number);
    const dateObj = new Date(year, month - 1, day);
    const formattedDate = dateObj.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });

    const prevTotalsResponse = await fetch(`http://localhost:8080/workouts/${workout.id}/sessions/${sessionId}/previous-totals`);
    let exercisesDelta = "", setsDelta = "", repsDelta = "", volumeDelta = "";
    if (prevTotalsResponse.ok) {
        const prev = await prevTotalsResponse.json();
        exercisesDelta = deltaSpan(exercisesCount - prev.exercises);
        setsDelta = deltaSpan(setsCount - prev.sets);
        repsDelta = deltaSpan(repsTotal - prev.reps);
        volumeDelta = deltaSpan(volumeTotal - prev.volume);
    }

    let container = document.getElementById("container");
    container.innerHTML = `
        <h2>Workout Summary - ${workout.name}</h2>
        <div class="summary-date">${formattedDate}</div>
        <div class="summary-stats">
            <div class="stat-box">
                <div class="stat-label">Exercises</div>
                <div class="stat-value">${exercisesCount}${exercisesDelta}</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">Sets</div>
                <div class="stat-value">${setsCount}${setsDelta}</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">Reps</div>
                <div class="stat-value">${repsTotal}${repsDelta}</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">Volume<span class="stat-unit">(kg)</span></div>
                <div class="stat-value">${volumeTotal}${volumeDelta}</div>
            </div>
        </div>
        <div id="summary-exercises"></div>
        <div class="page-actions">
            <button class="btn-secondary" onclick="${backOnClick}">Back</button>
        </div>
    `;

    const exercisesContainer = document.getElementById("summary-exercises");
    for (const exercise of workout.exercises) {
        const lastSetsResponse = await fetch(`http://localhost:8080/workouts/${workout.id}/exercises/${exercise.id}/last-sets?beforeSessionId=${sessionId}`);
        const lastSets = await lastSetsResponse.json();
        const isUnilateral = exercise.unilateral === true;

        let setsTableHtml = "";
        if (exercise.sets.length > 0) {
            let rows = "";
            if (isUnilateral) {
                const byId = (a, b) => a.id - b.id;
                const leftSets = exercise.sets.filter(s => s.side === "LEFT").sort(byId);
                const rightSets = exercise.sets.filter(s => s.side === "RIGHT").sort(byId);
                const prevLeft = lastSets.filter(s => s.side === "LEFT");
                const prevRight = lastSets.filter(s => s.side === "RIGHT");
                const pairs = Math.max(leftSets.length, rightSets.length);
                const emptyCell = `<div class="summary-set-cell summary-set-empty">-</div>`;
                for (let k = 0; k < pairs; k++) {
                    const L = leftSets[k];
                    const R = rightSets[k];
                    if (L) {
                        const prev = prevLeft[k];
                        const wd = prev ? deltaSpan(L.weight - prev.weight) : "";
                        const rd = prev ? deltaSpan(L.reps - prev.reps) : "";
                        rows += `
                            <div class="summary-set-row">
                                <div class="summary-set-num">Set L${k + 1}</div>
                                <div class="summary-set-cell">${L.weight}${wd}</div>
                                <div class="summary-set-cell">${L.reps}${rd}</div>
                            </div>
                        `;
                    } else {
                        rows += `
                            <div class="summary-set-row">
                                <div class="summary-set-num">Set L${k + 1}</div>
                                ${emptyCell}
                                ${emptyCell}
                            </div>
                        `;
                    }
                    if (R) {
                        const prev = prevRight[k];
                        const wd = prev ? deltaSpan(R.weight - prev.weight) : "";
                        const rd = prev ? deltaSpan(R.reps - prev.reps) : "";
                        rows += `
                            <div class="summary-set-row">
                                <div class="summary-set-num">Set R${k + 1}</div>
                                <div class="summary-set-cell">${R.weight}${wd}</div>
                                <div class="summary-set-cell">${R.reps}${rd}</div>
                            </div>
                        `;
                    } else {
                        rows += `
                            <div class="summary-set-row">
                                <div class="summary-set-num">Set R${k + 1}</div>
                                ${emptyCell}
                                ${emptyCell}
                            </div>
                        `;
                    }
                }
            } else {
                for (let k = 0; k < exercise.sets.length; k++) {
                    const set = exercise.sets[k];
                    const prev = lastSets[k];
                    let weightDelta = "";
                    let repsDelta = "";
                    if (prev) {
                        weightDelta = deltaSpan(set.weight - prev.weight);
                        repsDelta = deltaSpan(set.reps - prev.reps);
                    }
                    rows += `
                        <div class="summary-set-row">
                            <div class="summary-set-num">Set ${String(k + 1).padStart(2, "0")}</div>
                            <div class="summary-set-cell">${set.weight}${weightDelta}</div>
                            <div class="summary-set-cell">${set.reps}${repsDelta}</div>
                        </div>
                    `;
                }
            }
            setsTableHtml = `
                <div class="summary-set-header">
                    <div class="summary-set-num"></div>
                    <div class="summary-set-cell">Weight <span class="stat-unit">(kg)</span></div>
                    <div class="summary-set-cell">Reps</div>
                </div>
                ${rows}
            `;
        }

        const exerciseCard = document.createElement("div");
        exerciseCard.className = "summary-exercise-card";
        exerciseCard.innerHTML = `
            <div class="summary-exercise-name">${exercise.name}</div>
            <div class="summary-exercise-count">${exercise.sets.length} sets</div>
            ${setsTableHtml}
        `;
        exerciseCard.querySelector(".summary-exercise-name").onclick = function() {
            showExerciseReadOnlyModal(exercise);
        };
        exerciseCard.appendChild(createNotesPanel(exercise));

        exercisesContainer.appendChild(exerciseCard);
    }
}
loadWorkouts()