# Tsu2Track (Fitness-Tracker)

A mobile-first workout tracker: plan workouts, log every set at the gym, and see how you're doing against last time. It runs as a web app (added to the iPhone Home Screen) on top of a Spring Boot backend, with an iOS app wrapper in progress.

## Features

### Workouts
- **Workouts and exercises**: create named workouts, add exercises from the library, drag to reorder, and replace or remove exercises from each one's ⋮ menu.
- **Start from anywhere**: Start on the workout list, the workout's page, Home, or a planned day on the calendar. An open workout shows **Resume** instead.
- **Reset workout**: deletes every finished session of a workout and keeps the workout itself, its exercises and its repeat. A workout in progress is left alone.

### Logging a workout
- **Last time as hints**: each exercise opens with one row per set you did last time, with those numbers as placeholders. Tapping **Set 01** logs last time's numbers in one tap.
- **Saves as you go**: a set saves when you leave its row. There's no Save button. Saved sets get a green border. Emptying a box un-logs the set, and ✕ deletes the row.
- **Arrows against last time**: green `+2.5` / red `-2` show how each box compares with the same set last time.
- **Offline-tolerant**: a failed save turns the row red with a ↻ retry. Half-typed rows are kept on the device and survive a reload.
- **Exercise types**: weight × reps, reps only (bodyweight), time (planks), and distance + time (cardio). One-sided exercises log left and right separately.
- **Change exercises mid-workout**: add, replace, remove, reorder or reset an exercise for today. At Finish you choose **Today only** or **Update the workout from now on**.
- **Hints from other workouts**: an exercise never done in this workout uses the last time you did it anywhere, and says where ("Last time: from Push Day, 14 Nov").
- **Rest timer**: starts on its own when you log a set, using your rest time. Quick times (0:30 to 5:00) and −/+ 15 s are also available. It keeps the right time through sleep, reloads and closing the app.
- **Workout stopwatch**: times the workout from Start to Finish. The time is saved on the summary and in past sessions. It can be hidden in Settings.
- **No tab bar during a workout**, so it stays focused. A ‹ Home link leaves it running in the background. The bar also stays hidden while creating a workout or an exercise, in the exercise picker, and on the summary right after Finish.
- **Auto-end**: a workout with nothing logged for 5 hours is finished automatically, and its sets are kept.
- **Notes** per exercise.

### After a workout
- **Summary**: totals (exercises, sets, reps, volume, time) and each exercise compared with the previous session.
- **Past sessions** per workout, newest first, each opening its summary. They can be deleted from their ⋮.
- **Edit a finished workout**: tap an exercise's box on any summary, or a session on an exercise's History tab. The workout opens on the same set-logging page as a live one, on that exercise. Change, add or delete sets; they save as you go, with no Save or Finish. ‹ Back returns to where you came from, and Next on the last exercise shows the updated summary. Hints compare with the workout before that one, and a new set is logged the way that workout logged the exercise. Records, PRs, charts and next time's hints update on their own. The date and time stay the same. A workout in progress at the same time isn't affected.
  - **Change its exercises**, that day only (the workout's own list stays): **Add exercise** from the title's ⋮, and **Replace**, **Remove** or **Reset** from each exercise's ⋮, as in a live workout. Sets that would go are asked about first, and Remove isn't offered on the last exercise. Reset clears the exercise's history everywhere but keeps it in this workout with empty rows.
  - **An emptied workout is tidied away**: a past workout left with no sets at all is deleted when you leave its page (its calendar day goes back to planned), or at the next app start if the app was closed on it.

### Exercise library
- **584 built-in exercises** (from the public-domain [free-exercise-db](https://github.com/yuhonas/free-exercise-db)) plus your own **Custom** ones. Search, category pills, and an eye icon to show only Custom exercises.
- **Exercise page**: an Overview tab (cues and details) and a History tab (every session, records, and a trend chart of each day's best over 1M / 3M / 1Y / All).
- **Create and edit** your own exercises (category, type, equipment, compound/isolation, one-sided). Built-ins are read-only, and Edit offers a Custom copy.
- **Reset exercise**: deletes an exercise's finished history in every workout and keeps the exercise.

### Planning and progress
- **Calendar**: plan a workout on a day, skip or delete it, and see finished days marked done.
- **Repeating plans**: on chosen weekdays or every N days, with an optional end date.
- **Home**, on one phone screen:
  - "Hi, name" and a **week strip**: tap a day, swipe or use the arrows for other weeks, and **Today** to come back. Days are marked done, planned or skipped, like the calendar. Under it, this week's workouts against your weekly goal and the week streak (weeks that met their goal).
  - A **card for the selected day**: start today's plan (or any workout), **Resume** one in progress, what was done (View Summary), or what's planned. It always keeps the same size, so nothing jumps while it loads.
  - **Bodyweight** (log today's weigh-in right on the tile) and **Steps** tiles.
  - **Latest PR** (opens that exercise's History) and **Last session** (opens its summary). Back from anything opened on Home returns to the same day, even after a reload.
- **Bodyweight**: log a weigh-in per day and see the chart (1W and longer ranges).

### Getting around
- A floating, frosted **tab bar** (Home, Workouts, Calendar, Exercises), icons only. A green light on Home shows while a workout is open.
- Every page you open has the same **‹ Back** at its top left, going back to where you came from.

### Accounts
- Sign up with an **invite code**, then log in. Each account only sees its own data.
- A **profile** (name, optional date of birth, height, weekly goal).
- **Settings**: edit the profile, set the timers (rest time, stopwatch on/off), change the password, and log out on this device or everywhere.

## Tech stack

- **Backend**: Java 25, Spring Boot 4 (Web MVC, Data JPA, Security, Validation), H2 file database, Flyway migrations (`V1`–`V20`), Maven wrapper
- **Frontend**: plain HTML, CSS and JavaScript modules, no framework or build step, with a hash router
- **iOS**: [Capacitor](https://capacitorjs.com/) wrapping `frontend/` (`mobile/`), with unsigned builds on Codemagic (`codemagic.yaml`)
- **Tests**: JUnit + MockMvc for the backend, Puppeteer browser tests (`tests/browser`), and GitHub Actions CI

## Project layout

```
backend/fitness-tracker/   Spring Boot app (API, entities, services, Flyway migrations, built-in exercise list)
frontend/                  The web app (index.html, src/views, src/components, styles)
mobile/                    Capacitor iOS shell (uses ../frontend as its web content)
tests/browser/             Browser tests (real Chrome against a throwaway backend)
dev-phone.ps1              Starts everything for phone use over Tailscale
```

## Running it

### Quick start (one computer)

1. Start the backend:
   ```
   cd backend/fitness-tracker
   ./mvnw spring-boot:run
   ```
   The API runs on `http://localhost:8080`. Data is kept in `backend/fitness-tracker/data/`, and new migrations run on start-up.
2. Serve the front end on port 5500 (the default allowed origin), e.g.
   ```
   npx http-server frontend -p 5500 -c-1
   ```
   and open `http://127.0.0.1:5500`. VS Code's Live Server also works.
3. To sign up, the backend needs an invite code: set `APP_INVITE_CODE` before starting it. If it's blank, sign-up is closed.

### On a phone (Windows + Tailscale)

`.\dev-phone.ps1` from the repo root:
- backs up the database (locally, and to OneDrive when signed in)
- starts the backend in its own window, with CORS set for the Tailscale address
- serves the front end on port 5500

Open the printed `http://<tailscale-ip>:5500` in Safari on the phone and add it to the Home Screen. Backend changes need a backend restart; front-end changes only need a reload.

### Configuration

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `8080` | Backend port |
| `APP_DB_PATH` | `./data/fitness` | H2 database file |
| `APP_INVITE_CODE` | *(blank: sign-up closed)* | Code needed to create an account |
| `APP_CORS_ORIGINS` | `http://127.0.0.1:5500` | Comma-separated origins allowed to call the API |

## Tests

- **Backend** (375 tests, in-memory database, safe to run while the app is up):
  ```
  cd backend/fitness-tracker
  ./mvnw test
  ```
  They also run on GitHub Actions for every push and pull request.
- **Browser** (32 scripts covering Home, the tab bar and Back links, starting from the calendar, set logging, the timers, the live workout's buttons, changing exercises mid-workout, Reset, and editing a finished workout). They start their own backend on port 8091 with a throwaway database and the front end on 5591, so real data is never touched. They need Java and Chrome or Edge.
  ```
  cd tests/browser
  npm install
  npm test                 # everything
  npm test -- set-logging  # only files whose name contains this
  ```
  Screenshots go to `test screenshots/` at the repo root.

## API overview

Every call except sign-up and login needs `Authorization: Bearer <token>`. Another account's ids answer 404.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/signup`, `/auth/login`, `/auth/logout`, `/auth/logout-all`, `/auth/password`; `GET /auth/me` |
| Profile | `GET/PUT /profile`; `PUT /profile/rest-seconds`, `/profile/workout-timer` |
| Workouts | `GET/POST /workouts`, `DELETE /workouts/{id}`; `PUT /workouts/{id}/exercise-list`; `DELETE /workouts/{id}/history` (`GET …/history/count` to preview) |
| Workout exercises | `GET/POST /workouts/{id}/exercises`; `POST …/exercises/{exerciseId}/link`; `PUT/DELETE …/exercises/{id}`; `PUT …/exercises/{id}/replace/{replacementId}`; `PATCH …/exercises/order` |
| Repeats | `GET/PUT/DELETE /workouts/{id}/repeat` |
| Exercises | `GET/POST /exercises`; `GET/PUT/DELETE /exercises/{id}`; `POST /exercises/{id}/copy`; `PUT /exercises/{id}/note` |
| Exercise history | `GET /exercises/{id}/history`; `GET /exercises/{id}/last-done`; `GET /exercises/{id}/history/count`, `DELETE /exercises/{id}/history` (`?keepSessionId=` keeps it in a finished workout being edited) |
| Sessions | `GET/POST /workouts/{id}/sessions`; `GET /sessions/{id}`, `/sessions/unfinished`, `/sessions/overview` (everything Home shows), `/sessions/week?weekStart=` (another week's strip), `/sessions/{id}/exercises`; `POST /sessions/{id}/finish`; `DELETE /sessions/{id}`; a finished one's exercises: `POST /sessions/{id}/exercises`, `DELETE /sessions/{id}/exercises/{exerciseId}`, `PUT …/{exerciseId}/replace/{replacementId}`; `POST /sessions/{id}/remove-if-empty`; `GET /workouts/{id}/sessions/{sessionId}/previous-totals` |
| Sets | `GET/POST /sessions/{id}/sets`; `PUT/DELETE /sets/{id}` (also on a finished session); `GET /workouts/{id}/exercises/{exerciseId}/last-sets` |
| Calendar | `GET/POST /scheduled-workouts`; `GET /scheduled-workouts/by-date/{date}`; `PATCH/DELETE /scheduled-workouts/{id}` |
| Bodyweight | `GET /bodyweight`, `/bodyweight/summary`; `PUT/DELETE /bodyweight/{date}` |

## Roadmap

- iOS app through TestFlight, then **Screen Time blocking** of distracting apps during a workout
- Real step counts on the Home Steps tile
