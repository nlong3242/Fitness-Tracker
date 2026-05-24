let workouts = [];
let currentSessionId = null;
let currentSessionDate = null;

function renderWorkouts() {
    let container = document.getElementById("container");
    container.innerHTML = `
        <h2>My Workouts</h2>
        <button onclick="renderCreateWorkoutPage()">Create Workout</button>
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

function renderCreateWorkoutPage() {
    const pendingExercises = [];
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
        <div class="create-workout-actions">
            <button id="save-workout-btn" disabled>Save Workout</button>
            <button id="back-btn">Back</button>
        </div>
    `;

    const nameInput = document.getElementById("new-workout-name");
    const addExerciseBtn = document.getElementById("add-exercise-btn");
    const saveBtn = document.getElementById("save-workout-btn");
    const backBtn = document.getElementById("back-btn");
    const list = document.getElementById("pending-exercises-list");

    function renderPendingList() {
        list.innerHTML = "";
        for (let i = 0; i < pendingExercises.length; i++) {
            const item = document.createElement("li");
            item.appendChild(document.createTextNode(`${i + 1}. ${pendingExercises[i].name}`));
            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "Delete";
            deleteBtn.onclick = function() {
                pendingExercises.splice(i, 1);
                renderPendingList();
            };
            item.appendChild(deleteBtn);
            list.appendChild(item);
        }
    }

    addExerciseBtn.onclick = async function() {
        const data = await showExerciseFormModal();
        if (!data) return;
        pendingExercises.push(data);
        renderPendingList();
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
        newWorkout.exercises = [];
        for (const ex of pendingExercises) {
            const exResponse = await fetch(`http://localhost:8080/workouts/${newWorkout.id}/exercises`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(ex)
            });
            const savedEx = await exResponse.json();
            newWorkout.exercises.push(savedEx);
        }
        workouts.push(newWorkout);
        renderWorkouts();
    };

    backBtn.onclick = async function() {
        const hasChanges = nameInput.value.trim() !== "" || pendingExercises.length > 0;
        if (hasChanges) {
            const confirmed = await showConfirmModal("Discard this workout?", "Discard");
            if (!confirmed) return;
        }
        renderWorkouts();
    };
}

function showExerciseFormModal() {
    return new Promise(function(resolve) {
        const categories = ["CHEST", "ARMS", "BACK", "LEGS", "SHOULDERS", "CORE"];
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
        let selectedCategory = null;
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
    <button onclick="addExercise(${workoutIndex})">Add Exercise</button>
    <button onclick="startWorkout(${workoutIndex})">Start Workout</button>
    <ul id="exercise-list">
    </ul>
    <h3>Previous Sessions</h3>
    <div id="session-list"></div>
    <button id="load-more-sessions" style="display:none">Load More</button>
    <br><br>
    <button onclick="renderWorkouts()">Back</button>
`;

    let list = document.getElementById("exercise-list");
    for (let i = 0 ; i < workout.exercises.length; i++) {
        let item = document.createElement("li");
        let nameText = document.createTextNode(`${i + 1}. ${workout.exercises[i].name}`);

        let deleteBtn = document.createElement("button");
        deleteBtn.textContent = "Delete";
        deleteBtn.onclick = async function() {
            await fetch(`http://localhost:8080/workouts/${workout.id}/exercises/${workout.exercises[i].id}`, {
                method: "DELETE",
            });
            viewWorkout(workoutIndex);
        };


        item.appendChild(nameText);
        item.appendChild(deleteBtn);
        list.appendChild(item);
    }

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
    const data = await showExerciseFormModal();
    if (!data) return;
    await fetch(`http://localhost:8080/workouts/${workout.id}/exercises`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    });
    viewWorkout(workoutIndex);
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
        <button onclick="finishWorkout(${workoutIndex})">Finish Workout</button>
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
        card.className = "exercise-card";
        card.innerHTML = `
            <h3>${exercise.name}</h3>
            <div id="sets-${i}"></div>
        `;

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
        cards.appendChild(card);

        const container = document.getElementById("sets-" + i);
        if (isUnilateral) {
            for (const prev of exercise.previousSets) {
                container.appendChild(createInputRow(workout, exercise, i, prev.side));
            }
        } else {
            for (let k = 0; k < exercise.previousSets.length; k++) {
                container.appendChild(createInputRow(workout, exercise, i, null));
            }
        }
        updateHeaderVisibility(i);
        renumberSetRows(i, exercise);
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
            <input type="number" step="0.5" class="set-input weight-input">
            <span class="set-input-delta weight-delta"></span>
        </div>
        <div class="set-input-cell">
            <input type="number" class="set-input reps-input">
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

    weightInput.oninput = updateDeltas;
    repsInput.oninput = updateDeltas;

    async function persist() {
        if (persisting) return;
        const w = parseFloat(weightInput.value);
        const r = parseInt(repsInput.value);
        if (isNaN(w) || isNaN(r)) return;
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
            } else {
                if (currentSessionId === null) {
                    const sessionResponse = await fetch(`http://localhost:8080/workouts/${workout.id}/sessions`, {
                        method: "POST"
                    });
                    const session = await sessionResponse.json();
                    currentSessionId = session.id;
                    currentSessionDate = session.date;
                }
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

    async function maybeCleanupOrphanSession() {
        let hasAnySets = false;
        for (const ex of workout.exercises) {
            if (ex.sets.length > 0) {
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
        await maybeCleanupOrphanSession();
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
    renderWorkouts()
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
    await renderWorkoutSummary(workout, sessionId, sessionDate, "renderWorkouts()");
}

async function viewSessionSummary(workoutIndex, sessionId, sessionDate) {
    const workout = workouts[workoutIndex];
    if (!workout.exercises || workout.exercises.length === 0) {
        const exerciseResponse = await fetch(`http://localhost:8080/workouts/${workout.id}/exercises`);
        workout.exercises = await exerciseResponse.json();
    }

    const setsResponse = await fetch(`http://localhost:8080/sessions/${sessionId}/sets`);
    const sets = await setsResponse.json();
    const setsByExerciseId = new Map();
    for (const set of sets) {
        if (!setsByExerciseId.has(set.exerciseId)) {
            setsByExerciseId.set(set.exerciseId, []);
        }
        setsByExerciseId.get(set.exerciseId).push(set);
    }
    for (const exercise of workout.exercises) {
        exercise.sets = setsByExerciseId.get(exercise.id) || [];
    }

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

    let container = document.getElementById("container");
    container.innerHTML = `
        <h2>Workout Summary - ${workout.name}</h2>
        <div class="summary-date">${formattedDate}</div>
        <div class="summary-stats">
            <div class="stat-box">
                <div class="stat-label">Exercises</div>
                <div class="stat-value">${exercisesCount}</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">Sets</div>
                <div class="stat-value">${setsCount}</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">Reps</div>
                <div class="stat-value">${repsTotal}</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">Volume<span class="stat-unit">(kg)</span></div>
                <div class="stat-value">${volumeTotal}</div>
            </div>
        </div>
        <div id="summary-exercises"></div>
        <button onclick="${backOnClick}">Back</button>
    `;

    const exercisesContainer = document.getElementById("summary-exercises");
    for (const exercise of workout.exercises) {
        const lastSetsResponse = await fetch(`http://localhost:8080/workouts/${workout.id}/exercises/${exercise.id}/last-sets?excludeSessionId=${sessionId}`);
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
        exercisesContainer.appendChild(exerciseCard);
    }
}
loadWorkouts()