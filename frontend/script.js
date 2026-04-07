let workouts = [];

function createWorkout() {
    let name = prompt("Enter workout name:");
    if (name) {
        workouts.push({name: name, exercises: []});
        renderWorkouts();
    }
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
        deleteBtn.onclick = function(event) {
            event.stopPropagation();
            workouts.splice(i, 1);
            renderWorkouts();
        };

        item.appendChild(nameText);
        item.appendChild(deleteBtn);
        list.appendChild(item);
    }
}

function viewWorkout(index) {
    let workout = workouts[index];
    let container = document.getElementById("container");
    container.innerHTML = `
        <h2>${workout.name}</h2>
        <button onclick="addExercise(${index})">Add Exercise</button>
        <ul id="exercise-list">
        </ul>
        <button onclick="renderWorkouts()">Back</button>
    `;

    let list = document.getElementById("exercise-list");
    for (let i = 0 ; i < workout.exercises.length; i++) {
        let item = document.createElement("li");
        let nameText = document.createTextNode(workout.exercises[i]);

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

function addExercise(workoutIndex) {
    let name = prompt("Enter exercise name:")
    if (name) {
        workouts[workoutIndex].exercises.push(name);
        viewWorkout(workoutIndex);
    }
}

renderWorkouts()