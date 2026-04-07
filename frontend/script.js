let workouts = [];

function createWorkout() {
    let name = prompt("Enter workout name:");
    if (name) {
        workouts.push(name);
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
        let nameText = document.createTextNode(workouts[i]);
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
    let name = workouts[index];
    let container = document.getElementById("container");
    container.innerHTML = `
        <h2>${name}</h2>
        <button onclick="addExercise()">Add Exercise</button>
        <ul id="exercise-list">
        </ul>
        <button onclick="renderWorkouts()">Back</button>
    `;
}

renderWorkouts()