# Session Notes — Fitness Tracker

A summary of what was built and discussed during the most recent working sessions. Read top-to-bottom for context on the current state of the app.

---

## Drag-to-Reorder Exercises

Long-press drag-and-drop reordering was added to three surfaces in three phases. A single helper, `attachLongPressDrag(rowEl, opts)`, powers all of them — vanilla JS, no third-party drop-in. Each surface differs only in what `onReorder(from, to)` does.

### The helper

State machine, four states: `idle → pressing → armed → dragging`.

- `pointerdown` enters `pressing`. A 180 ms timer is started.
- Moving > 8 px before the timer fires cancels (treats it as a page scroll).
- If still pressing when the timer fires, state becomes `armed` — visually invisible to the user. Nothing lifts yet.
- In `armed`, moving > 5 px begins the actual drag: the row is pulled out of flow (`position: fixed`), a dashed-pink `<div>` placeholder of identical height takes its slot, the row gets a sage glow, and the body cursor switches to `grabbing`.
- Releasing in `pressing` or `armed` (no movement) is a plain tap — the click passes through to the row's own handler.
- Releasing in `dragging` drops at the placeholder's position; the helper computes a `toIndex` and calls `opts.onReorder(originIndex, toIndex)`. The next synthetic `click` is swallowed in capture phase so tap handlers don't double-fire.
- Escape during drag cancels with no reorder.
- Pointerdown on a nested `button, input, textarea, select, a` is ignored, so the Remove button on Create Workout rows and the set inputs / Add Set / notes textarea on live workout cards all keep working.

### Why a state machine (not a single timer)

The first cut used one timer: if the timer fires, drag begins and the next click is suppressed. This made tap-to-open-details break — a user tap that happened to last ≥ 200 ms was being interpreted as a no-op drag and the suppressed click meant the modal never opened. The two-stage model fixes this: long-press only *arms* the drag, and drag only actually begins if the user *also* moves. Tap duration no longer competes with drag detection. `longPressMs` is now an arming delay, not a tap/drag decision threshold.

### Phase 1 — Create Workout (no backend)

Each `<li>` in the pending exercises list gets the drag handler. `onReorder` splices `state.pendingExercises` and re-renders the list (which already renumbers `1.`, `2.`, `3.` on every render). No API call is needed — saving the workout posts `/link` for each pending exercise in array order, and the backend's `findMaxPositionForWorkout + 1` already assigns sequential `position` values in POST order. The Remove button on each row keeps working because the helper's pointerdown filter skips nested buttons.

### Phase 2 — View Workout (persists)

New endpoint: `PATCH /workouts/{workoutId}/exercises/order` with body `{ orderedExerciseIds: [...] }`. The handler validates the list is a permutation of the workout's current live exercise ids (409 otherwise) and updates each `WorkoutExercise.position` inside a `@Transactional` method — JPA dirty-checking flushes the updates atomically on commit. Since `findLiveByWorkoutId` already orders by `position ASC`, the next GET reflects the new order with no extra work.

Frontend: the per-exercise loop inside `viewWorkout` is extracted into a local `rebuildExerciseList()`. `onReorder` mutates `workout.exercises` and calls that, fires the PATCH, and on failure rolls back the in-memory order, rebuilds again, and shows a confirm modal as a generic error. CORS in `WebConfig` had to be expanded to allow `PATCH`.

### Phase 3 — Live Workout (session-only)

Each `.exercise-card` div in `startWorkout` becomes a drag target. `onReorder` reorders `workout.exercises` in memory **and moves the card DOM node** to its new position (`removeChild` + `insertBefore`) — no rebuild.

The no-rebuild move is important: every per-card closure (the `Add Set` button, each set row's cancel handler, `updateHeaderVisibility(i)`, `renumberSetRows(i, exercise)`) captures the original loop index `i` and looks up its container by id (`sets-${i}`). Because we move the card *node* rather than rebuilding, those ids stay attached to the right cards, every closure keeps working, and **unsaved set inputs, the `.saved` state class, and the notes draft all survive a reorder for free**.

Session-only by design — chosen over "save back to template" because one accidental drag mid-workout shouldn't permanently restructure the user's routine. The saved `WorkoutExercise.position` is untouched. Next time you start the same workout, it loads in the saved template order.

CSS note: the `.dragging` and `.drag-placeholder` rules were originally scoped to `li.` for the first two phases. Phase 3 drops the prefix so the same visual treatment applies to `.exercise-card` divs.

### Live order → session snapshot

A bug appeared after Phase 3 went in: the freshly-finished workout summary showed the live-reordered order (because it was rendered from the in-memory `workout.exercises`), but re-opening that same session from "Previous Sessions" later showed the *template* order. The DB snapshot was wrong.

Root cause: `SessionController.finishSession` was reading `findLiveByWorkoutId(workoutId)` to enumerate exercises and assigning `SessionExercise.position = 0, 1, 2, ...` in that order. The client's in-memory live order was never sent. Fix:

- `finishSession` now accepts an optional `FinishBody { orderedExerciseIds }`. When present, snapshot positions are written in that order (filtered to currently-linked exercises, then any currently-linked-but-missing are appended, then orphan exercises that only exist via session sets are appended last).
- `finishWorkout` on the frontend sends `workout.exercises.map(e => e.id)` in the body.
- When no body is provided (older clients, hypothetically), behaviour falls back to template order — same as before.

The template still doesn't change. Only the session's own snapshot reflects what the user actually did, which is exactly what historical-session view should show.

### Touch behavior

Rows get `touch-action: pan-y` so vertical page scroll still works on mobile. Drag only starts after the 180 ms arm + 5 px move, so a swipe-to-scroll cancels naturally (the > 8 px pre-arm threshold trips first). `contextmenu` is suppressed while armed/dragging so long-press doesn't pop the system context menu on touch devices.

---

## Reusable Building Blocks (Visual Components)

Shared component conventions from the cozy sakura visual pass. All defined in `style.css` and used everywhere via class + CSS custom properties.

- **`button` (default)** — sage green fill, near-black warm brown text (`#1F0E0C`), weight 700. The brown-on-sage was chosen specifically for legibility — vibrant enough to pop without going to harsh black.
- **`.btn-secondary`** — filled muted warm brown (`#5C4642`) for Back/neutral actions on dark page backgrounds. Solid fill (no outline) so the button doesn't read as floating text.
- **`.modal-cancel`** — filled muted tan (`#C9B0A8`) for Cancel inside modals (cream surfaces). Same hierarchy as `.btn-secondary` but in the cream-surface context.
- **`.btn-danger`** — explicit rust + white text for ad-hoc destructive buttons.
- **`.page-actions`** — flex wrapper used at the top of every page to host primary + secondary action buttons consistently.
- **`.filter-pill`** — outlined pink pill (3px border) for category filters on dark pages; filled pink + dark-brown text when selected.
- **`.modal-pill`** — same shape as filter pill but tuned for use inside cream modals (brown text on transparent vs cream text on dark for filter-pill).

### Input treatment

All text inputs share the same focus behavior — a 4px pink border with compensating padding so nothing reflows when focus arrives or leaves. Applies to set inputs (weight/reps on workout-in-progress), the workout-name input on Create Workout, modal form inputs (Create/Edit Exercise), and the notes textarea.

Set inputs use a soft pale cream (`#F0D9D3`) bg instead of pure white so they sit gently inside the cream exercise cards instead of feeling clinical. The "saved" state on a set row uses a thick 4px sage border as a strong "this is logged" signal — same width as focus, different color.

### Palette tokens worth remembering

| Token | Use |
|---|---|
| `--bg` | Cozy coffee-brown body bg |
| `--surface` / `--surface-hover` | Cream cards (workout rows, exercise cards, modals, stat boxes) |
| `--accent-pink` / `--accent-pink-hover` | Sakura highlights, focus borders, pill outlines, selected pills |
| `--text-primary` / `--text-muted` | Warm brown text on cream / muted warm gray |
| `--text-on-dark` / `--text-on-dark-muted` | Cream tint text on dark page bg / secondary |
| `--border` | Soft pink-tan card borders, dividers |
| `--action` / `--action-hover` | Sage green primary action |
| `--danger` / `--danger-hover` | Warm rust destructive action |

Positive-delta text uses deeper sage (`#4D9967`) instead of `--action` so it reads cleanly as text on cream surfaces; negative delta uses `--danger` as-is.

---

## Frontend Module Architecture

After this session's modular refactor, the frontend lives under `frontend/src/` with one HTML script tag (`<script type="module" src="src/main.js">`) and a flat-by-responsibility ES module layout:

```
src/
├── main.js                      — entry; loads workouts, renders landing
├── config.js                    — API_BASE, CATEGORY_ORDER
├── state.js                     — { workouts, currentSessionId, currentSessionDate }
├── api.js                       — every fetch() wrapper, grouped by resource
├── session.js                   — ensureCurrentSession / maybeCleanupOrphanSession
├── utils/
│   ├── format.js                — escapeHtml, formatCategoryLabel, deltaSpan, formatSessionDate
│   └── dragDrop.js              — attachLongPressDrag
├── components/
│   ├── modals.js                — confirm + 3 exercise modals
│   ├── notesPanel.js
│   ├── categoryPills.js         — groupExercisesByCategory + renderCategoryPillRow
│   ├── libraryList.js
│   └── setInputRow.js           — createInputRow + header + renumber (tightly coupled)
└── views/
    ├── landing.js
    ├── workouts.js              — renderWorkouts + renderCreateWorkoutPage
    ├── workoutDetail.js
    ├── library.js
    ├── exercisePicker.js        — renderMultiSelectExercisePicker + addExercise
    ├── activeWorkout.js         — startWorkout + finishWorkout
    └── summary.js               — renderWorkoutSummary + viewSessionSummary
```

### Shared state via a single mutable object

`state.js` exports one constant `state` object — `{ workouts, currentSessionId, currentSessionDate }`. Consumers mutate fields directly (`state.workouts = ...`, `state.currentSessionId = null`). The reference is constant; the fields are free. Avoids the getter/setter ceremony of wrapping every field, and ES module live bindings keep the imported reference always-current across modules.

### Cycles are safe

The view graph has cycles (e.g., `workouts → workoutDetail → exercisePicker → workouts`). They don't break because every imported function is used inside an event handler / async callback body, not at module evaluation time. By the time the handler fires, every module has finished loading and the live binding resolves.

### Why one entry, not many script tags

Per-file `<script>` tags would have meant explicit dependency ordering in `index.html` — fragile, easy to break by adding a file. With `type="module"` the import graph handles load order automatically. One tag = one source of truth for the frontend root.

---

## This Session — Frontend Modular Refactor

The 1762-line monolithic `script.js` was split into 19 ES modules under `frontend/src/`. No behavior changes — the goal was structural maintainability only. The full file layout lives in "Frontend Module Architecture" above; this section captures the *why* and the gotchas that came up during the split.

### Inline `onclick=""` strings → programmatic handlers

The original embedded HTML attribute handlers like `<button onclick="renderCreateWorkoutPage()">` and `<button class="btn-secondary" onclick="${backOnClick}">`. Inline attribute handlers only see the global scope, and ES module exports never reach `window` — so every one of these would silently break on first click.

All converted to `id="..."` + `document.getElementById(...).onclick = fn`, matching the pattern already used in many places (Library page, picker, modals). The only behavioral nuance: `renderWorkoutSummary` used to take a *code string* as its last argument (`"renderWorkouts()"` or `` `viewWorkout(${i})` ``) and interpolate it into HTML for the browser to eval. It now takes an `onBack` callback function instead — cleaner, and module-friendly.

### Fetch dedup → api.js

The original had ~25 inline `fetch()` calls scattered through view functions, each repeating the URL, method, headers, and JSON body wrap. All collapsed into `api.js` wrappers grouped by resource (workouts, exercise-link, sessions, sets, exercises). Two internal helpers (`request` and `requestJson`) handle the boilerplate. `fetchPreviousTotals` is the one wrapper that returns the raw `Response` so callers can check `.ok` before parsing — preserves the original "no deltas if endpoint returns non-2xx" behavior.

### Small dedup wins along the way

`formatSessionDate` was inlined twice (in `viewWorkout` for the session list, and in `renderWorkoutSummary` for the header) — extracted to `utils/format.js`. `buildLibraryRow` and `createHeaderRow` had no external callers, so they became non-exported module-private functions inside their respective files.

### Why `setInputRow` keeps three functions in one file

Per the "tightly coupled functions stay together" rule. `createInputRow`, `updateHeaderVisibility`, and `renumberSetRows` share a DOM contract (`set-header-row` class, `data-side` attr, `sets-${i}` container id, the `_savedSet` / `_updateDeltas` properties stamped onto each row element). Splitting them would have meant a header-only "DOM contract" module no one would read. They're one file.

### Verification

Smoke-tested by clicking through every flow in the browser. No regressions observed. ES module cycles between view files were a concern (workouts ↔ workoutDetail, workoutDetail ↔ exercisePicker, workoutDetail ↔ summary) but all resolve correctly because every import is dereferenced inside function bodies, not at module evaluation.

---

## This Session — CSS Architecture Refactor

The 888-line monolithic `frontend/style.css` was split into 15 cohesive CSS files under `frontend/styles/`, structured to mirror the JS architecture from the previous session. No visual behavior changes — purely structural.

### Layout

```
frontend/styles/
├── main.css                    — entry; @imports everything in cascade order
├── base/
│   ├── variables.css           — :root design tokens (palette, semantic colors)
│   ├── elements.css            — body, h1, ul, li (cream card-row pattern)
│   └── buttons.css             — button default + .btn-secondary + .btn-danger
├── layout/
│   └── page.css                — #container, .page-actions, .empty-sessions
├── components/                 — mirrors frontend/src/components/
│   ├── modals.css              — confirm + form + read-only modals
│   ├── notes-panel.css         — three-state notes wrapper
│   ├── category-pills.css      — .filter-pill + .library-pill-row container
│   ├── library-list.css        — category-grouped list heading
│   └── set-input-row.css       — live-workout set row + delta badges + .saved
├── pages/                      — mirrors frontend/src/views/
│   ├── landing.css             — landing hero + 2-card grid + only media query
│   ├── workouts.css            — Create Workout form
│   ├── workout-detail.css      — Previous Sessions row
│   ├── exercise-picker.css     — multi-select picker rows + action bar
│   ├── active-workout.css      — .exercise-card (live workout)
│   └── summary.css             — stat grid, summary card, set table, .delta
└── animations/
    └── drag-drop.css           — .draggable-row, .dragging, .drag-placeholder
```

### Entry via `@import`, not many `<link>` tags

`index.html` references one stylesheet (`styles/main.css`) which `@import`s the rest in cascade order: tokens → base → layout → components → pages → animations. Same reasoning as the JS side — one source of truth for what loads, dependency order in one place. Animations load last so `.dragging` / `.drag-placeholder` `!important` rules win against the underlying `li` / `.exercise-card` card styles they decorate.

### Module-by-module mapping

Every JS module that owns DOM has a 1:1 CSS file (or shares one with a tightly coupled sibling). The exceptions — `main.js`, `state.js`, `api.js`, `session.js`, `config.js`, `utils/format.js` — own no DOM and have no CSS. `utils/dragDrop.js` is the one util that *does* manipulate DOM (lifts a node out of flow, inserts a placeholder), so it gets `animations/drag-drop.css`.

`.library-pill-row` lives in `components/category-pills.css` because the container only ever hosts `.filter-pill` children — separating them would split one cohesive widget across two files. Same instinct applied to `.empty-sessions`, which is used by three views (workoutDetail, libraryList, exercisePicker) and lives in `layout/page.css` as a shared empty-state primitive rather than being duplicated.

### Dead code dropped

Two CSS classes had no JS consumers — `.set-input-save` and `.set-row`. Both were leftovers from the pre-modular `script.js`. Removed.

### Things deliberately not changed

- No class names renamed (JS references them as string literals).
- No selector restructure for the `li` / `.dragging` / `.drag-placeholder` globals — load order is what makes the cascade correct, see comment in `animations/drag-drop.css` plus the SESSION_NOTES Phase 3 "CSS note" callout.
- No deduplication of the card-hover-lift pattern shared by `li` / `.session-row` / `.picker-select-row`, or the 4px-pink-focus pattern shared by all text inputs. Extracting these would mean adding a new utility class to JS-rendered elements — outside the scope of a CSS-only refactor. Visible duplication, contained, good candidate for a follow-up pass that touches both layers.

### Verification

Smoke-tested by clicking through every flow. No visual regressions observed. Drag-to-reorder still applies to both `<li>` rows (Create Workout, View Workout) and `.exercise-card` `<div>`s (Active Workout) because the `.dragging` selector stays unprefixed.

---

## This Session — Past Sessions Page

The "Previous Sessions" list — previously rendered inline at the bottom of the View Workout page — was promoted to its own dedicated view, reachable from a new **Past Sessions** button on the workout detail page. The detail page now stays focused on managing the workout's exercises; browsing history is one click away on its own surface.

### New view: `views/pastSessions.js`

Mirrors the paginated `loadSessionPage` pattern that previously lived inside `viewWorkout` — same `fetchSessionsPage(workoutId, page, 5)` call, same `session-row` markup, same `Load More` button. The function `viewPastSessions(workoutIndex)` is exported and wired to the new button on the detail page. Heading is `${workout.name} History` — chosen over the original "Past Sessions for {name}" phrasing because it's shorter, fits a narrower viewport, and uses the standard UX label "History" for past activity.

Empty state reuses the shared `.empty-sessions` primitive from `layout/page.css`; no new component was needed.

### `viewSessionSummary` gained an optional `onBack`

Clicking a session from the History page should land Back on the History page, not back on the workout detail page. `viewSessionSummary(workoutIndex, sessionId, sessionDate)` now accepts an optional 4th `onBack` argument. When the History page calls in, it passes `function() { viewPastSessions(workoutIndex); }`; when the argument is omitted, the function defaults to going back to `viewWorkout(workoutIndex)` — so any caller that doesn't know about the new signature keeps its prior behaviour exactly.

### `views/workoutDetail.js` got smaller

The `Previous Sessions` heading, the `#session-list` container, the `#load-more-sessions` button, and the `loadSessionPage` closure (~27 lines) were all removed. The imports `fetchSessionsPage`, `formatSessionDate`, and `viewSessionSummary` went with them — no longer used here. The new button sits in its own `.page-actions` row directly below the existing Add Exercise / Start Workout row, deliberately separated so the visual hierarchy keeps "modify the workout" actions together and "navigate to history" on its own line.

### CSS moved, not duplicated

`.session-row`, `.session-row:hover`, and `.session-index` were the only rules in `pages/workout-detail.css` — they belong to session rows, which now live on the new page. Moved verbatim into a new `pages/past-sessions.css`. `workout-detail.css` is kept (with just a header comment) so the 1:1 view-to-css mapping rule from the CSS refactor session still holds; if any detail-page-specific styling shows up later it has a home ready. `main.css` got the new `@import url("./pages/past-sessions.css");` line in the Pages group, ordered next to `workout-detail.css` because the two pages are conceptually paired.

### Verification

Walked through: open a workout with multiple sessions → click Past Sessions → list paginates correctly → click a session → Summary loads → Back returns to History (not detail) → Back from History returns to detail. Empty-workout case shows the "No previous sessions yet." message on the new page. No visual regressions on the slimmed-down detail page.

---

## This Session — Calendar ↔ Sessions Unification

The calendar was already wired end-to-end (Start, Skip, Delete, Reschedule, the past-as-skipped display rule, the workout-first Schedule button). This session closed the remaining loops so the calendar truthfully reflects activity in both directions and so the row gestures all map to something sensible.

### Auto-sync finished sessions to the calendar

When a user finishes a workout, the calendar should show it — regardless of whether they started from a schedule or ad-hoc. `activeWorkout.commitFinish` now calls a `syncCalendarOnFinish(workoutId, sessionId, date, scheduledWorkoutId)` helper after `finishSession`. Three branches:

- **Started from schedule** — PATCH that row to `COMPLETED` and link the `sessionId` that just finished.
- **Ad-hoc, same workout already PLANNED for that date** — PATCH the PLANNED row to `COMPLETED` instead of POSTing a new one. Avoids the backend's `(date, workoutId)` uniqueness reject, and converges to "calendar shows what actually happened" (the planned row gets promoted rather than duplicated).
- **Ad-hoc, no matching row** — POST a new row carrying `status: COMPLETED` + `sessionId`.

All three swallow failures — the workout summary still renders even if the sync round-trip blows up. Best-effort by design.

The backend changes were narrow: `ScheduledWorkoutController.CreateBody` and `PatchBody` accept optional `status` and `sessionId`. `status` defaults to `PLANNED` via the entity's `@PrePersist` when omitted (so existing POSTs still work unchanged). `sessionId` is validated against `SessionRepository` and linked via the `ScheduledWorkout.session` `@OneToOne` that was already defined on the entity but never populated until now. The existing `getSessionId()` getter auto-serializes through Jackson.

Frontend pulled `sessionDate` from `state.currentSessionDate` (already captured at session creation) instead of parsing `finishSession`'s response — simpler, and means no wrapper changes in `api.js`.

### COMPLETED rows are read-only AND navigable

Two changes on the same row, same status, complementary in intent:

1. **Read-only** — Reschedule and Delete are now disabled on COMPLETED rows (Start and Skip were already disabled because `isStartable` required PLANNED). Mirrors the backend's existing "Cannot delete a finished session" rule from `SessionController.deleteSession`. Finished sessions are immutable historical record; the calendar should reflect that.
2. **Navigable** — tapping the row body of a COMPLETED row jumps to the session summary via `viewSessionSummary(workoutIndex, sessionId, date, backToDay)`. Reuses the existing summary view; no new rendering code.

`renderScheduleRow` now stamps a `data-click-target` attribute (`"summary"` or `"workout"`) that the click delegation reads. This avoids re-deriving the status inside the click handler and keeps the dispatch declarative.

Click conflict with the action buttons is handled by the same delegation: the handler checks for `.schedule-action-btn` first, and only falls through to the row-body navigation if the click wasn't on a button.

### PLANNED / SKIPPED rows navigate to workoutDetail

Continued the "tap a row to see what it represents" semantic: for COMPLETED it's the session record, for PLANNED/SKIPPED there's no session, so the right target is the workout template. `openWorkoutDetailFromSchedule` calls `setActiveTab("workouts")` first (so the bottom-nav highlight matches the destination) then `viewWorkout(workoutIndex)`, overriding the default workouts-list paint. Same trick `navigateToCalendarDay` uses in reverse from the workoutDetail Schedule button.

Both display-states get this treatment — explicit SKIPPED (user tapped Skip) and display-SKIPPED (PLANNED in the past, shown as SKIPPED via `effectiveStatus`). The underlying schedule still references a workout in both cases, so the click target is the same.

Trade-off: `viewWorkout`'s Back button returns to the workouts list, not to the calendar day. Considered plumbing an optional `onBack` override but the bottom-nav lets the user one-tap back to Calendar — not worth the signature churn on `viewWorkout` for marginal polish.

### Empty-workout Start gate

A workout with zero exercises used to drop the user on an empty preview page when they tapped Start. Fixed in two surfaces:

**workoutDetail page** — Start Workout is disabled when `workout.exercises.length === 0`. Below the (empty) exercise `<ul>`, a sibling `<div class="empty-sessions">No exercises for "{name}" yet.</div>` explains the state.

Gotcha worth flagging: my first cut put the empty-state inside the `<ul>` as an `<li class="empty-sessions">`. That inherited the base `li` style from `elements.css` (pink cream pill, border, hover lift) so the message rendered as a fake list-row. Fixed by moving it to a sibling `<div>` outside the `<ul>` — matches the Past Sessions empty-state pattern. The page.css comment about `.empty-sessions` already noted it's a `<div>`-styled primitive; it just wasn't visible until I tried the wrong placement.

**Calendar day modal** — same rule applied to schedule rows. Required a small backend change: `GET /workouts` now returns `{id, name, exerciseCount}` via a tiny `WorkoutSummary` DTO. `WorkoutExerciseRepository.countLiveByWorkoutId` reuses the same "exclude soft-deleted exercises" semantics as `findLiveByWorkoutId` so the count matches what the user actually sees in the workoutDetail list. `POST /workouts` returns the same shape (newly-created workouts have `exerciseCount: 0`).

`renderScheduleRow` reads `exerciseCount` from `state.workouts` via a `workoutExerciseCount(workoutId)` helper and ANDs it with the existing PLANNED gate on the Start button.

While in there, also split `isSkippable` off `isStartable` — they used to share. An empty-workout PLANNED row should still let the user mark it Skipped (just because you can't do the workout doesn't mean you can't acknowledge you're not doing it), so Skip's gating is now PLANNED-only, independent of exercise count.

### state.workouts staleness on the calendar

`state.workouts` is loaded once at startup (main.js:6). After the user adds/removes exercises elsewhere, the cached `exerciseCount` would go stale. Fix: `refreshWorkoutsCache()` re-fetches `/workouts` at both calendar entry points — `renderCalendarPage` (nav-tab tap) and `navigateToCalendarDay` (from the workoutDetail Schedule button). The refresh inside `navigateToCalendarDay` runs BEFORE `setActiveTab` because `setActiveTab` doesn't await the tab's `render()` and `renderDayDetail` fires immediately after — without the pre-refresh, `renderDayDetail` could race against the in-flight `renderCalendarPage` fetch and read stale data.

Considered the lighter alternative — updating the cache locally on every `linkExerciseToWorkout` / `removeWorkoutExercise` call — but that spreads logic across three view files (`exercisePicker`, `workoutDetail`, `workouts`). One fetch per calendar entry is the simpler trade-off; the calendar is a relatively infrequent surface and `/workouts` is small.

### Files touched (this session)

- `backend/.../ScheduledWorkoutController.java` — optional `status` + `sessionId` on `CreateBody`/`PatchBody`, `SessionRepository` injected.
- `backend/.../WorkoutController.java` — returns `WorkoutSummary` DTO from GET and POST.
- `backend/.../WorkoutExerciseRepository.java` — new `countLiveByWorkoutId` query.
- `frontend/src/views/activeWorkout.js` — `syncCalendarOnFinish` helper, imports.
- `frontend/src/views/calendar.js` — `isEditable` + `clickTarget` + `isSkippable` gating, two `open…FromSchedule` helpers, `refreshWorkoutsCache`.
- `frontend/src/views/workoutDetail.js` — Start gate + empty-state.
- `frontend/styles/pages/calendar.css` — `.schedule-row.clickable` hover lift.

### Verification

Walked through:
- Ad-hoc finish on a clean day → calendar shows COMPLETED dot, tap → session summary opens, Back returns to day modal.
- Ad-hoc finish on a day with the same workout already PLANNED → single COMPLETED row, not two.
- Schedule a workout for today → tap Start from day modal → finish → schedule row shows COMPLETED with link to the session that just ran.
- Tap a COMPLETED row's Reschedule/Delete → buttons are disabled, no response.
- Create a new workout with no exercises → Start Workout button disabled, empty-state message visible. Schedule that workout for today → from Calendar day modal, Start is disabled but Skip works. Tap the row → lands on workoutDetail.
- Tap a SKIPPED row → lands on workoutDetail.
- Add an exercise to a previously-empty workout, navigate to Calendar → Start now enabled on that workout's schedule rows (cache refreshed).

---

## Future Plans (Discussed, Not Built)

- **Built-in exercise library shipped with the app.** A curated, immutable preset list users can browse and pick from. When this lands, the right split is:
  - Built-in = static JSON shipped with the app (they never change per user, can be cached aggressively).
  - User-created = fetched from the API (small, mutable).
  - Merge client-side. Keeps both tiny.
- **Per-row subtitles in the picker** — small grey line under each name with `primaryMuscleGroups · exerciseType` so users can identify exercises at a glance without a details modal. Deferred until the picker function is stable.
- **Cross-workout "last sets" history** — currently `findLastSetsForExercise` is scoped to the same workout. With shared exercises, you might want "last time I benched in *any* workout" instead. Worth a separate design pass.
- **Red-flash on rejected input** — per-field visual indication when a value is rejected by validation. Planned but explicitly deferred this session in favor of just the silent-reject + dropped-tick approach. See "Saved-state class" above for the planned mechanic.
- **Bodyweight exercises as a first-class concept** — currently bodyweight is implicit via `weight = 0`. A dedicated flag (or exercise-level "bodyweight" type) would be cleaner and could drive UI changes like hiding the weight input entirely.

---

## Repo State Note

This session's commits on `master` (closing the calendar feature loop):

- `df6416b` — Open workoutDetail when tapping a PLANNED or SKIPPED row.
- `972ff64` — Disable Start on calendar rows whose workout has no exercises (adds `exerciseCount` to `/workouts`).
- `682e313` — Disable Start when a workout has no exercises, show empty state (workoutDetail).
- `861c976` — Auto-sync finished sessions to the calendar + open summary on tap (the HANDOFF_calendar_session_sync.md spec plus the click-to-summary feature; HANDOFF file deleted afterward).

Plus a follow-up SESSION_NOTES commit capturing this section.

Earlier sessions on `master`:

- The calendar feature itself (commits `6ff76d1` through `3fefe72`) — backend CRUD, frontend scaffolding, day modal actions, Start-from-schedule, workout-first Schedule button.
- `c696db1` — Update SESSION_NOTES for the CSS architecture refactor.
- `8d739bd` — Refactor frontend style.css into modular CSS architecture.
- `57aa2f6` — Refactor frontend script.js into ES modules.
