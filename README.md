# Fitness-Tracker (Tsu2Track)

A web-based fitness tracker for creating workouts, logging sets per session, and tracking progress against previous sessions.

## Features

- **Workouts and exercises** — create named workouts, add exercises to each.
- **Live set logging** — start a workout and each exercise pre-fills input rows based on the number of sets you did last session, with placeholders showing your previous weights and reps. Auto-saves on tab-out — no explicit save button.
- **Live progress deltas** — as you enter a value, a `+N` (green) or `-N` (red) badge appears in the corner of the input showing how it compares to last session's same-position set.
- **Editable saved sets** — fix typos by typing into the box and tabbing out. Each saved set is clearly marked with a thick green border.
- **Lazy session creation** — sessions are only created when the first set is logged, and auto-deleted when the last set is removed, so the database never has orphan empty sessions.
- **Workout Summary** — after finishing, see a per-session summary with totals (Exercises / Sets / Reps / Volume) and a per-exercise breakdown with deltas vs. the previous session.
- **Past session browser** — each workout page lists previous sessions (paginated, 5 per Load More), newest first. Clicking any session opens its full summary view.

## Tech Stack

- **Backend**: Java + Spring Boot, Spring Data JPA, H2 in-memory database
- **Frontend**: plain HTML / CSS / JavaScript (no framework)
- **Build**: Maven (via the included wrapper)

## How to Run

1. Clone the repo:
   ```
   git clone https://github.com/nlong3242/Fitness-Tracker.git
   ```
2. Start the backend (from the project root):
   ```
   cd backend/fitness-tracker
   ./mvnw spring-boot:run
   ```
   The API will be available at `http://localhost:8080`.
3. Open `frontend/index.html` in a browser.

## API Overview

- `GET/POST /workouts`, `DELETE /workouts/{id}`
- `GET/POST /workouts/{id}/exercises`, `DELETE /workouts/{id}/exercises/{exerciseId}`
- `GET /workouts/{id}/sessions?page=&size=`, `POST /workouts/{id}/sessions`, `DELETE /sessions/{id}`
- `GET /sessions/{id}/sets`, `POST /sessions/{id}/sets?exerciseId=`
- `PUT /sets/{id}`, `DELETE /sets/{id}`
- `GET /workouts/{id}/exercises/{exerciseId}/last-sets?beforeSessionId=` — returns sets from the most recent session strictly older than `beforeSessionId` (by date, then by id) for a given exercise, used to drive placeholders and deltas. When omitted, returns the absolute latest session's sets.
