let workouts = [];

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

 async function viewWorkout(index) {
    let workout = workouts[index];
    const response = await fetch(`http://localhost:8080/workouts/${workout.id}/exercises`);
    const data = await response.json();
    workout.exercises = data;
    let container = document.getElementById("container");
    container.innerHTML = `
    <h2>${workout.name}</h2>
    <button onclick="addExercise(${index})">Add Exercise</button>
    <button onclick="startWorkout(${index})">Start Workout</button>
    <ul id="exercise-list">
    </ul>
    <button onclick="renderWorkouts()">Back</button>
`;

    let list = document.getElementById("exercise-list");
    for (let i = 0 ; i < workout.exercises.length; i++) {
        let item = document.createElement("li");
        let nameText = document.createTextNode(`${i + 1}. ${workout.exercises[i].name}`);

        let deleteBtn = document.createElement("button");
        deleteBtn.textContent = "Delete";
        deleteBtn.onclick = function() {
            workout.exercises.splice(i, 1);
            viewWorkout(index);
        };


        item.appendChild(nameText);
        item.appendChild(deleteBtn);
        list.appendChild(item);
    }
}

async function addExercise(workoutIndex) {
    const workout = workouts[workoutIndex]
    let name = prompt("Enter exercise name:")
    if (!name) return;
    const response = await fetch(`http://localhost:8080/workouts/${workout.id}/exercises`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ name: name })
    });
    viewWorkout(workoutIndex);
}

function startWorkout(index) {
    let workout = workouts[index];
    let container = document.getElementById("container");
    container.innerHTML = `
        <h2>${workout.name} - Workout</h2>
        <div id="exercise-cards"></div>
        <button onclick="renderWorkouts()">Finish Workout</button>
    `;

    let cards = document.getElementById("exercise-cards");
    for (let i = 0; i < workout.exercises.length; i++) {
        let exercise = workout.exercises[i];

        let card = document.createElement("div");
        card.className = "exercise-card";
        card.innerHTML = `
            <h3>${exercise.name}</h3>
            <div id="sets-${i}"></div>
        `;

        let addSetBtn = document.createElement("button");
        addSetBtn.textContent = "Add Set";
        addSetBtn.onclick = function() {
            let weight = prompt("Enter weight:");
            let reps = prompt("Enter reps:");
            if (weight && reps) {
                exercise.sets.push({ weight: parseFloat(weight), reps: parseInt(reps) });
                renderSets(i, exercise);
            }
        };

        card.appendChild(addSetBtn);
        cards.appendChild(card);
        renderSets(i, exercise);
    }
}

function renderSets(exerciseIndex, exercise) {
    let setsDiv = document.getElementById("sets-" + exerciseIndex);
    setsDiv.innerHTML = "";
    for (let j = 0; j < exercise.sets.length; j++) {
        let set = exercise.sets[j];
        let setRow = document.createElement("div");
        setRow.className = "set-row";

        let setText = document.createTextNode(
            "Set " + (j + 1) + ": " + set.weight + "kg x " + set.reps
        );

        let deleteBtn = document.createElement("button");
        deleteBtn.textContent = "X";
        deleteBtn.onclick = function() {
            exercise.sets.splice(j, 1);
            renderSets(exerciseIndex, exercise);
        };

        setRow.appendChild(setText);
        setRow.appendChild(deleteBtn);
        setsDiv.appendChild(setRow);
    }
}

async function loadWorkouts() {
    const response = await fetch("http://localhost:8080/workouts");
    const data = await response.json();
    workouts = data;
    renderWorkouts()
}

loadWorkouts()