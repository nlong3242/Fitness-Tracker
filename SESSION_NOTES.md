# Session Notes — Fitness Tracker

A summary of what was built and discussed during the most recent working session. Read top-to-bottom for context on the current state of the app.

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
