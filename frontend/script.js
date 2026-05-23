let workouts = [];
let currentSessionId = null;
let currentSessionDate = null;

async function createWorkout() {
    const name = prompt("Enter Workout name:");
    if (!name) return;
    const response = await fetch("http://localhost:8080/workouts", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ name: name })
    });
    const newWorkout = await response.json();
    newWorkout.exercises = [];
    workouts.push(newWorkout);
    renderWorkouts()
}

function renderWorkouts() {
    let container = document.getElementById("container");
    container.innerHTML = `
        <h2>My Workouts</h2>
        <button onclick="createWorkout()">Create Workout</button>
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
    const workout = workouts[workoutIndex]
    let name = prompt("Enter exercise name:")
    if (!name) return;
    await fetch(`http://localhost:8080/workouts/${workout.id}/exercises`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ name: name })
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

        const lastSetsResponse = await fetch(`http://localhost:8080/workouts/${workout.id}/exercises/${exercise.id}/last-sets`);
        exercise.previousSets = await lastSetsResponse.json();

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
            container.appendChild(createInputRow(workout, exercise, i));
            renumberSetRows(i, exercise);
        };

        card.appendChild(addSetBtn);
        cards.appendChild(card);

        const container = document.getElementById("sets-" + i);
        container.appendChild(createHeaderRow());
        for (let k = 0; k < exercise.previousSets.length; k++) {
            container.appendChild(createInputRow(workout, exercise, i));
        }
        renumberSetRows(i, exercise);
    }
}

function createInputRow(workout, exercise, exerciseIndex) {
    const row = document.createElement("div");
    row.className = "set-input-row";
    row.innerHTML = `
        <div class="set-input-num"></div>
        <input type="number" step="0.5" class="set-input weight-input">
        <input type="number" class="set-input reps-input">
        <button class="set-input-save">&#10003;</button>
        <button class="set-input-cancel">&#10005;</button>
    `;
    const weightInput = row.querySelector(".weight-input");
    const repsInput = row.querySelector(".reps-input");
    row.querySelector(".set-input-save").onclick = async function() {
        const weight = weightInput.value;
        const reps = repsInput.value;
        if (!weight || !reps) return;
        if (currentSessionId === null) {
            const sessionResponse = await fetch(`http://localhost:8080/workouts/${workout.id}/sessions`, {
                method: "POST"
            });
            const session = await sessionResponse.json();
            currentSessionId = session.id;
            currentSessionDate = session.date;
        }
        const response = await fetch(`http://localhost:8080/sessions/${currentSessionId}/sets?exerciseId=${exercise.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ weight: parseFloat(weight), reps: parseInt(reps) })
        });
        const set = await response.json();
        exercise.sets.push(set);
        row.replaceWith(createSavedRow(workout, exercise, exerciseIndex, set));
        renumberSetRows(exerciseIndex, exercise);
    };
    row.querySelector(".set-input-cancel").onclick = function() {
        row.remove();
        renumberSetRows(exerciseIndex, exercise);
    };
    return row;
}

function createSavedRow(workout, exercise, exerciseIndex, set) {
    const row = document.createElement("div");
    row.className = "set-input-row saved";
    row.innerHTML = `
        <div class="set-input-num"></div>
        <div class="set-input saved-cell">${set.weight}</div>
        <div class="set-input saved-cell">${set.reps}</div>
        <button class="set-input-cancel set-delete">&#10005;</button>
    `;
    row.querySelector(".set-delete").onclick = async function() {
        await fetch(`http://localhost:8080/sets/${set.id}`, { method: "DELETE" });
        const idx = exercise.sets.indexOf(set);
        if (idx >= 0) exercise.sets.splice(idx, 1);
        row.remove();
        renumberSetRows(exerciseIndex, exercise);
    };
    return row;
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

        let setsTableHtml = "";
        if (exercise.sets.length > 0) {
            let rows = "";
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