import { fetchExerciseHistory } from "../api.js";
import { findWorkout } from "../state.js";
import { escapeHtml } from "../utils/format.js";

/* An exercise's PRs and past sessions, rendered into `container`. Used by
   the History tab of the exercise popup in a live workout (and the
   exercise page's History tab). Sessions come 10 at a time with "Load more".
   ★ marks the set shown in the Best set card, one per side for a
   unilateral exercise (the backend decides; see ExerciseHistoryService). */

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
    const max = r => `≈ ${Math.round(r.weight * (1 + r.reps / 30))} kg max`;
    // Heaviest weight leads with the weight alone; its reps stay as small
    // print so 87.5 × 1 and 87.5 × 9 can still be told apart.
    const h = records.heaviest;
    const heaviest = card("Heaviest weight", `${kg(h.weight)}<span class="exh-unit"> kg</span>`, `× ${h.reps} · ${shortDate(h.date)}`);

    const sides = [["L", records.bestLeft], ["R", records.bestRight]].filter(([, r]) => r);
    if (sides.length === 0) {
        const b = records.bestSet;
        return `
            <div class="exh-records">
                ${heaviest}
                ${card("Best set", `${kg(b.weight)}<span class="exh-unit"> kg</span> × ${b.reps}`, `${max(b)} · ${shortDate(b.date)}`)}
            </div>`;
    }

    // Unilateral: a best set (and ★) per side, too much for a half-width
    // card, so Best set gets its own full-width card with a line per side.
    // "Both" only appears if the exercise also has two-sided sets (it was
    // switched to unilateral later).
    if (records.bestSet) sides.unshift(["Both", records.bestSet]);
    const lines = sides.map(([label, r]) => `
        <div class="exh-side-best">
            <span class="exh-side">${label}</span>
            <span class="exh-side-best-set">${kg(r.weight)}<span class="exh-unit"> kg</span> × ${r.reps}</span>
            <span class="exh-record-sub">${max(r)} · ${shortDate(r.date)}</span>
        </div>`).join("");
    return `
        <div class="exh-records">${heaviest}</div>
        <div class="exh-record exh-record-wide">
            <div class="exh-record-label">Best set</div>
            ${lines}
        </div>`;
}

function sessionHtml(s) {
    const workout = findWorkout(s.workoutId);
    // "80 kg × 4" so weight and reps can't be mixed up; 0 kg → "10 reps".
    const chip = set => `
        <span class="exh-set${set.pr ? " pr" : ""}">${set.pr ? `<span class="exh-star" aria-label="PR">★</span>` : ""}${
            set.weight > 0 ? `${kg(set.weight)}<span class="exh-unit"> kg</span> × ${set.reps}` : `${set.reps} reps`}</span>`;
    // Unilateral: one row per side, labelled once (L, then R).
    const rows = [[null, "", s.sets.filter(x => !x.side)],
                  ["LEFT", "L", s.sets.filter(x => x.side === "LEFT")],
                  ["RIGHT", "R", s.sets.filter(x => x.side === "RIGHT")]]
        .filter(([, , sets]) => sets.length > 0)
        .map(([side, label, sets]) => `
            <div class="exh-set-row">${side ? `<span class="exh-side exh-row-side">${label}</span>` : ""}${sets.map(chip).join("")}</div>`)
        .join("");
    return `
        <div class="exh-session">
            <div class="exh-session-head">
                <span class="exh-session-date">${shortDate(s.date)}</span>
                <span class="exh-session-workout">${escapeHtml(workout ? workout.name : "Workout")}</span>
            </div>
            ${rows}
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
