# Session Notes — Fitness Tracker

A summary of what was built and discussed during the most recent working session. Read top-to-bottom for context on the current state of the app.

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

## Cozy Sakura Visual Redesign

The whole UI was reskinned in this session to move away from the default dark-navy "yet another tracker" look toward a warm, cozy game-UI feel inspired by sakura pink + cream cafe pixel art. Function is unchanged — every existing screen kept its layout and behavior; only the visual language was rewritten.

### Landing Page Introduced

The app no longer boots straight into the workouts list. A new `renderLandingPage()` is the entry point: a hero with welcome title + tagline, and two large clickable cards (Workouts, Exercise Library). The workouts list is reachable via the Workouts card; "Create Workout" moved off the landing page onto the workouts list where it sits contextually with the list it adds to.

### Palette (CSS Custom Properties)

Defined once at the top of `style.css` and used everywhere via `var(--token)`:

| Token | Value | Use |
|---|---|---|
| `--bg` | `#2A1F1E` | Cozy coffee-brown body background |
| `--surface` | `#E0CAC5` | All cream cards (workout rows, exercise cards, modals, stat boxes) |
| `--surface-hover` | `#E7D1CC` | Card hover variant |
| `--accent-pink` | `#F7B7C3` | Sakura pink — highlights, focus borders, pill outlines, selected pills |
| `--accent-pink-hover` | `#E89AA8` | Deeper pink for hover states |
| `--text-primary` | `#4A2C2A` | Warm dark brown — text on cream surfaces |
| `--text-muted` | `#8B6B6B` | Warm gray — muted text on cream |
| `--text-on-dark` | `#F0DDD4` | Cream tint — text on the dark body bg |
| `--text-on-dark-muted` | `#C9B5AC` | Muted cream — secondary text on dark |
| `--border` | `#E8D0CC` | Soft pink-tan — card borders, dividers |
| `--action` | `#6FBF8E` | Sage green — primary action buttons |
| `--action-hover` | `#57A675` | Deeper sage on hover |
| `--danger` | `#DC5947` | Warm rust — destructive actions |
| `--danger-hover` | `#BF4232` | Deeper rust |

Semantic colors (green = positive, red = negative) were preserved but shifted into the warm palette — sage instead of bright green, rust instead of bright red — so intuition is unchanged.

### Reusable Building Blocks

- **`button` (default)** — sage green fill, near-black warm brown text (`#1F0E0C`), weight 700. The brown-on-sage was chosen specifically for legibility — vibrant enough to pop without going to harsh black.
- **`.btn-secondary`** — filled muted warm brown (`#5C4642`) for Back/neutral actions on dark page backgrounds. Solid fill (no outline) so the button doesn't read as floating text.
- **`.modal-cancel`** — filled muted tan (`#C9B0A8`) for Cancel inside modals (cream surfaces). Same hierarchy as `.btn-secondary` but in the cream-surface context.
- **`.btn-danger`** — explicit rust + white text for ad-hoc destructive buttons.
- **`.page-actions`** — flex wrapper used at the top of every page to host primary + secondary action buttons consistently.
- **`.filter-pill`** — outlined pink pill (3px border) for category filters on dark pages; filled pink + dark-brown text when selected.
- **`.modal-pill`** — same shape as filter pill but tuned for use inside cream modals (brown text on transparent vs cream text on dark for filter-pill).

### Input Treatment

All text inputs share the same focus behavior — a 4px pink border with compensating padding so nothing reflows when focus arrives or leaves. Applies to:

- Set inputs (weight/reps on workout-in-progress)
- Workout-name input (Create Workout)
- Modal form inputs (Create Exercise / Exercise Details)
- Notes textarea

Set inputs use a soft pale cream (`#F0D9D3`) bg instead of pure white so they sit gently inside the cream exercise cards instead of feeling clinical. The "saved" state on a set row uses a thick 4px sage border as a strong "this is logged" signal — same width as focus, different color.

### Page-by-Page Rollout Order

Reskin was done in this order so the user could evaluate at each step:

1. **Landing page** — palette established here.
2. **Workouts list** — global `<li>` and `button` styles cascaded to other pages as a base.
3. **Exercise Library** + **multi-select picker** — share components, done together.
4. **Modals** (confirm, form, read-only details).
5. **Create Workout** page.
6. **View Workout** (single workout page), including the Previous Sessions block.
7. **Workout in Progress** — the dense set-logging screen.
8. **Workout Summary** — stat boxes + per-exercise breakdown.

### Notable UX Touches

- **Pill outlines are 3px** (not the soft 2px from earlier iterations) because subtle borders were reading as "floating text."
- **Cancel/Back buttons are filled muted** (not transparent outlined) for the same reason — clearly button-shaped while still hierarchically below primary actions.
- **Positive-delta text uses deeper sage** (`#4D9967`) instead of `--action` so it reads cleanly as text on cream surfaces; negative delta uses `--danger` as-is.
- **Card hovers** lift slightly (`translateY(-1px)`) with a soft pink glow shadow so the interaction feels tactile.
- The **"Previous Sessions" heading** on the View Workout page reuses `library-group-heading` (muted cream with pink-tinged underline) so section dividers feel consistent.
- **Add Notes button** has a 3px solid brown border (not soft pink) because the soft pink blended into the surrounding cream card.

---

## Features Added Today

### Exercise Library — First-Class, Multi-Workout Exercises

Exercises are now library-owned and reusable across multiple workouts. A new `WorkoutExercise` join entity sits between `Workout` and `Exercise` and carries the per-workout `position` field. `Exercise.workout` is gone.

- **`WorkoutExercise`** — `(id, workout, exercise, position)` with a unique constraint on `(workout_id, exercise_id)` so the same exercise can't be linked to the same workout twice.
- **`Workout.exercises`** is now `List<WorkoutExercise>` with `cascade=ALL, orphanRemoval=true` — deleting a workout cleans up its join rows but never touches the underlying exercises.
- **`WorkoutExerciseRepository.findLiveByWorkoutId(workoutId)`** — JPQL that filters `exercise.deleted = false` and orders by position. This single query replaces the old `findByWorkout_IdAndDeletedFalse` on `ExerciseRepository`.
- **No DB migration needed** — H2 is in-memory, schema is rebuilt on every startup. The redesign is destructive to existing in-memory data but matters nothing in practice.

### Library Endpoints

- `GET /exercises` → `findByDeletedFalseOrderByNameAsc()`. The library list.
- `POST /exercises` → create library-only (no workout link).
- `PUT /exercises/{id}` → workout-agnostic update.
- `DELETE /exercises/{id}` → soft-delete (`deleted=true`). Cascades to every workout via the join filter.
- `POST /workouts/{wId}/exercises` — now does **two things atomically**: creates the Exercise and the `WorkoutExercise` join row. Used by the picker's "Create Exercise" button when the user is creating exercises while also adding to a specific workout (this path was later replaced — see below).
- `POST /workouts/{wId}/exercises/{eId}/link` — adds an existing library exercise to a workout (409 on duplicate). The picker uses this for "Add N to {workout}".
- `DELETE /workouts/{wId}/exercises/{eId}` — **changed semantics**: now removes the join row only. Exercise stays in the library and in any other workouts.

### Two Distinct "Delete" Operations

| Action | What it does | Where it lives |
|---|---|---|
| **Remove from workout** | Delete the `WorkoutExercise` join row. Exercise stays in library and other workouts. | viewWorkout exercise row → details modal → `Remove` button |
| **Delete from library** | Soft-delete the `Exercise` (`deleted=true`). Disappears from every workout via the join filter. Past sessions still see it via `SessionExercise` snapshots. | Exercise Library exercise row → details modal → `Delete` button |

Confirm messages are deliberately short: `Remove "Bench Press" from "Push Day"?` and `Delete "Bench Press" permanently?`. "Permanently" matches the user's mental model even though we soft-delete under the hood — there is no undelete UI, and past-session retention is a behind-the-scenes guarantee, not part of the user's intent when clicking delete.

### Session Snapshot Compatibility

`SessionController.finishSession` now reads from `workoutExerciseRepository.findLiveByWorkoutId(workoutId)` to enumerate "current exercises in this workout." Snapshot rows still go through `SessionExercise` with their fields cached at finish time. The `SessionSnapshotMigration` `CommandLineRunner` is untouched — it operates on `set → exercise`, not on the workout-exercise relationship.

### Frontend — Library Page

- **"Exercise Library" button** on the home page next to "Create Workout."
- **`renderExerciseLibrary`** fetches all exercises once, groups by category, and renders.
- **Category pill row** at the top: `All | Chest | Arms | Back | Legs | Shoulders | Core`. Default `All` (category-grouped view). Selecting a specific pill shows a flat list of just that category. Filtering is **client-side** off the single fetch — instant, no spinners, no race conditions.
- Click an exercise row → reuses `showExerciseDetailsModal` (editable, with the library-context Delete button).

### Frontend — Multi-Select Picker (Used by Both Add Flows)

A new full-page picker replaces the old single-pick library modal:

- Same pill row as the library page (All + 6 categories).
- Each exercise row is a checkbox + name (already-linked exercises are hidden).
- Bottom-right action: `Add N to "Push Day"`, disabled at 0, shows live count.
- Top: `Create Exercise` and `Cancel`.

**Create Exercise from inside the picker** — important UX detail driven by user feedback. POSTs to `/exercises` (library only, **not** the create-and-link endpoint), adds the new exercise to `available`, ticks its checkbox, and **jumps the pill row to the new exercise's category**. This preserves the user's other selections — they can keep picking without losing their work, and the new exercise gets linked along with everything else when they tap `Add N to ...`.

The picker is extracted into `renderMultiSelectExercisePicker(opts)` and used from:

1. **`viewWorkout` Add Exercise** — onCancel returns to viewWorkout; onConfirm POSTs `/link` for each selected exercise and returns to viewWorkout.
2. **`renderCreateWorkoutPage` Add Exercise** — onCancel/onConfirm return to the create-workout page with state preserved (workout name + pending exercises). The pending list now holds plain exercise objects (all are library entries); save POSTs the workout, then POSTs `/link` for each pending exercise.

The create-workout pending-list row button is labelled **`Remove`**, not `Delete` — unstaging from a local in-memory list is not destructive.

---

## Design Discussion — Many-to-Many vs Alternatives

Three storage models were considered before committing to many-to-many:

- **A. Single `Exercise` table with nullable `workout_id`** — minimal change. The library is `SELECT * FROM exercise WHERE deleted=false`. Each exercise still belongs to at most one workout. Rejected because the user explicitly wants the same exercise reusable across multiple workouts.
- **B. Many-to-many via an explicit join entity** — `WorkoutExercise` carries `(workout, exercise, position)`. Soft-delete on `Exercise` cascades to all workouts via the join filter. "Remove from workout" deletes the join row. **Chosen.**
- **C. Two tables — `LibraryExercise` template + per-workout `Exercise` instance** — cleanest separation conceptually but adds a sync question (do library edits propagate to existing workouts?) and doubles the entity surface. Overkill for now.

The "remove from workout" vs "delete from library" split fell naturally out of option B and matches what the user wanted: deleting from the library should cascade to all workouts, removing from one workout should leave the exercise alone everywhere else.

## Design Discussion — Picker UX

The first cut was a choice modal (`Create New` vs `Pick from Library`) plus a single-pick library modal. User feedback was that picking exercises one at a time is annoying when building a workout, so it was redesigned as a full-page multi-select picker.

We considered three options for what happens when you tap an exercise row in the picker:

- **Add immediately, return to workout.** Fastest but no way to add several in one trip.
- **Open details modal (same as front-page library).** Most flexible but more clicks and mixes intents.
- **Multi-select with bottom action button.** **Chosen.** Matches "queue up several exercises in one go."

We deliberately stripped details access from the picker — if you want to inspect/edit an exercise, the front-page library is one tap away, and mixing select-mode with edit-mode in the same view creates clutter and mode confusion. Per-row subtitles (muscle groups · type) were discussed and deferred to keep this iteration focused on the function.

For the fetch strategy: chose "fetch all upfront, filter client-side." At ~250 bytes per exercise, even 300 exercises is ~75 KB — smaller than a single image. Pill switching is a `.filter()` call, no network round-trip, no loading states. The breaking point isn't until multiple thousands.

---

## Future Plans (Discussed, Not Built)

- **Built-in exercise library shipped with the app.** A curated, immutable preset list users can browse and pick from. When this lands, the right split is:
  - Built-in = static JSON shipped with the app (they never change per user, can be cached aggressively).
  - User-created = fetched from the API (small, mutable).
  - Merge client-side. Keeps both tiny.
- **Per-row subtitles in the picker** — small grey line under each name with `primaryMuscleGroups · exerciseType` so users can identify exercises at a glance without a details modal. Deferred until the picker function is stable.
- **Cross-workout "last sets" history** — currently `findLastSetsForExercise` is scoped to the same workout. With shared exercises, you might want "last time I benched in *any* workout" instead. Worth a separate design pass.

---

## Repo State Note

Two commits landed this session on `master`:

- `bdc0d94` — Add exercise library with many-to-many workout linking (backend + frontend, ~700 LOC net).
- `935197e` — Reuse multi-select exercise picker on the create-workout page (refactor; net **−150 LOC** after stripping duplicate modal code).

Stray `.class` files at the repo root (`Exercise.class`, `ExerciseSet.class`, `Main.class`, `Workout.class`) are untracked leftovers from old console-prototype builds. They were present at session start and are unrelated to this work. Worth `.gitignore`ing in a future cleanup but not pulled into the feature commits.

The unrelated `.vscode/settings.json` modification was also present at session start and was deliberately excluded from the feature commits.

---

## Optional Reading — Deployment & Security

> Not necessary for next-chat context. Skip unless you specifically ask the model to look at this section.

The app currently exposes every endpoint with no authentication. That is **fine for local/personal use** because it runs on `localhost`, the H2 database is in-memory, and there is no PII. If/when the app is deployed publicly, the following matters:

**Real concerns:**
- **No authentication** — anyone hitting the URL can read/modify/delete every workout, session, and set.
- **No user isolation** — there is no `User` entity. Everyone shares the same data.
- **CORS wide open** — other websites could call the API from a user's browser. Without auth, this means data exfiltration.
- **No rate limiting** — a bot could spam `POST /workouts` and fill the DB.

**Not a concern (Spring covers these):**
- SQL injection — JPA uses parameterized queries.
- Mass assignment of IDs — controllers set relationships explicitly, not from request body.

**Roughly ordered fix-list if going to production:**

1. **Authentication + Authorization** — Spring Security with JWT or session cookies. Add a `User` entity, attach `Workout` to a user, enforce ownership in controllers. This is ~90% of real protection.
2. **Lock down CORS** to the actual frontend origin only.
3. **HTTPS everywhere** — mandatory. Free via Let's Encrypt or Cloudflare.
4. **Rate limiting** — Bucket4j on Spring, or at the proxy layer (Cloudflare / nginx).
5. **Don't expose internals** — disable Swagger/OpenAPI in production, lock down `/actuator/**`, return generic error pages instead of stack traces.
6. **(Advanced) Backend-for-Frontend pattern** — the public-facing server (BFF) holds the session and calls the Spring API internally on a private network. The Spring API never has a public IP. This is how serious apps (banking, SaaS) typically work. Overkill for a fitness tracker but worth knowing about.

**You cannot truly "hide" endpoints from a browser** — they show up in DevTools' Network tab the moment the frontend calls them. What "hiding" really means in practice is making unauthorized calls fail. Items 1 + 2 + 3 are the mandatory baseline for any public deployment.
