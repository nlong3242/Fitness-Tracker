import { fetchExerciseHistory } from "../api.js";
import { findWorkout } from "../state.js";
import { escapeHtml } from "../utils/format.js";

/* An exercise's PRs and past sessions, rendered into `container`. Used by
   the History tab of the exercise popup in a live workout (and the
   Exercise History page). Sessions come 10 at a time with "Load more".
   The one ★ marks the set shown in the Best set card (the backend
   decides; see ExerciseHistoryService). */

const PAGE_SIZE = 10;

export async function renderExerciseHistory(container, exerciseId) {
    container.innerHTML = `<p class="exh-empty">Loading…</p>`;
    let first;
    try {
        first = await fetchExerciseHistory(exerciseId, 0, PAGE_SIZE);
    } catch (e) {
        container.innerHTML = `<p class="exh-empty">Couldn't load the history. Check your connection and try again.</p>`;
        return;
    }
    if (first.sessions.length === 0) {
        container.innerHTML = `<p class="exh-empty">No finished sessions yet. Your history and PRs show up here after the first one.</p>`;
        return;
    }

    container.innerHTML = `
        ${recordsHtml(first.records)}
        <div class="exh-sessions"></div>
        <button type="button" class="btn-secondary exh-more" hidden>Load more</button>
    `;
    const list = container.querySelector(".exh-sessions");
    const more = container.querySelector(".exh-more");
    let page = 0;

    function append(history) {
        list.insertAdjacentHTML("beforeend", history.sessions.map(sessionHtml).join(""));
        more.hidden = !history.hasMore;
    }
    append(first);

    more.onclick = async function() {
        more.disabled = true;
        more.textContent = "Loading…";
        try {
            const next = await fetchExerciseHistory(exerciseId, page + 1, PAGE_SIZE);
            page++;
            append(next);
            more.textContent = "Load more";
        } catch (e) {
            more.textContent = "Couldn't load — tap to retry";
        }
        more.disabled = false;
    };
}

function recordsHtml(records) {
    if (!records.heaviest) return "";   // bodyweight-only so far: nothing to rank by weight
    const card = (label, value, sub) => `
        <div class="exh-record">
            <div class="exh-record-label">${label}</div>
            <div class="exh-record-value">${value}</div>
            <div class="exh-record-sub">${sub}</div>
        </div>`;
    // Heaviest weight leads with the weight alone; its reps stay as small
    // print so 87.5 × 1 and 87.5 × 9 can still be told apart.
    const h = records.heaviest, b = records.bestSet;
    const oneRm = Math.round(b.weight * (1 + b.reps / 30));
    return `
        <div class="exh-records">
            ${card("Heaviest weight", `${kg(h.weight)}<span class="exh-unit"> kg</span>`, `× ${h.reps} · ${shortDate(h.date)}`)}
            ${card("Best set", `${kg(b.weight)}<span class="exh-unit"> kg</span> × ${b.reps}`, `≈ ${oneRm} kg max · ${shortDate(b.date)}`)}
        </div>`;
}

function sessionHtml(s) {
    const workout = findWorkout(s.workoutId);
    const sets = s.sets.map(set => `
        <span class="exh-set${set.pr ? " pr" : ""}">${set.pr ? `<span class="exh-star" aria-label="PR">★</span>` : ""}${
            set.side ? `<span class="exh-side">${set.side === "LEFT" ? "L" : "R"}</span>` : ""}${
            set.weight > 0 ? `${kg(set.weight)} × ${set.reps}` : `${set.reps} reps`}</span>`).join("");
    return `
        <div class="exh-session">
            <div class="exh-session-head">
                <span class="exh-session-date">${shortDate(s.date)}</span>
                <span class="exh-session-workout">${escapeHtml(workout ? workout.name : "Workout")}</span>
            </div>
            <div class="exh-set-row">${sets}</div>
        </div>`;
}

// 60 → "60", 62.5 → "62.5"
function kg(n) {
    return String(Math.round(n * 100) / 100);
}

// "Tue 20 Oct", with the year added when it isn't this year.
function shortDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const opts = { weekday: "short", day: "numeric", month: "short" };
    if (y !== new Date().getFullYear()) opts.year = "numeric";
    return date.toLocaleDateString("en-GB", opts).replace(",", "");
}
