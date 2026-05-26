import { updateExerciseNote } from "../api.js";
import { showConfirmModal } from "./modals.js";

export function createNotesPanel(exercise) {
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
        const updated = await updateExerciseNote(exercise.id, textarea.value);
        exercise.notes = updated.notes || "";
        refreshDisplay();
    };

    wrapper.appendChild(addBtn);
    wrapper.appendChild(box);
    wrapper.appendChild(panel);
    refreshDisplay();
    return wrapper;
}
