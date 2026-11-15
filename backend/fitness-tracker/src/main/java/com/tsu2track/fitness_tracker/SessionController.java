package com.tsu2track.fitness_tracker;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.tsu2track.fitness_tracker.service.SessionService;

@RestController
public class SessionController {
    private static final int MAX_PAGE_SIZE = 100;

    private final SessionService sessionService;

    public SessionController(SessionService sessionService) {
        this.sessionService = sessionService;
    }

    @GetMapping("/workouts/{workoutId}/sessions")
    public Page<Session> getSessions(
        @PathVariable Long workoutId,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "5") int size
    ) {
        // Clamp instead of rejecting: PageRequest.of throws on a negative page
        // or a size below 1, and an uncapped size returns the whole history.
        int safePage = Math.max(page, 0);
        int safeSize = Math.clamp(size, 1, MAX_PAGE_SIZE);
        return sessionService.findSessions(workoutId, PageRequest.of(safePage, safeSize));
    }

    // What Reset workout would delete (finished sessions, their sets), for its question.
    @GetMapping("/workouts/{workoutId}/history/count")
    public SessionService.HistoryCount countWorkoutHistory(@PathVariable Long workoutId) {
        return sessionService.countWorkoutHistory(workoutId);
    }

    // Reset workout: deletes its finished sessions (SessionService.resetWorkoutHistory);
    // answers what went.
    @DeleteMapping("/workouts/{workoutId}/history")
    public SessionService.HistoryCount resetWorkoutHistory(@PathVariable Long workoutId) {
        return sessionService.resetWorkoutHistory(workoutId);
    }

    // 204 when there's nothing to resume.
    @GetMapping("/sessions/unfinished")
    public ResponseEntity<Session> getUnfinishedSession() {
        return sessionService.findUnfinishedSession()
            .map(ResponseEntity::ok)
            .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /* Home page stats. lastSession / nextPlanned are null when there's none;
       plannedThatDay counts nextPlanned's day's plans still to do, itself
       included (0 with no nextPlanned). */
    public record HomeOverview(long sessionsThisWeek, Session lastSession,
                               int weekStreak, ScheduledWorkout nextPlanned,
                               long plannedThatDay) {}

    // today defaults to the server's date for pages cached before it was sent.
    @GetMapping("/sessions/overview")
    public HomeOverview getOverview(@RequestParam LocalDate weekStart,
                                    @RequestParam(required = false) LocalDate today) {
        ScheduledWorkout next = sessionService.findNextPlanned(today != null ? today : LocalDate.now()).orElse(null);
        return new HomeOverview(
            sessionService.countFinishedInWeek(weekStart),
            sessionService.findLastFinishedSession().orElse(null),
            sessionService.countWeekStreak(weekStart),
            next,
            next != null ? sessionService.countPlannedOn(next.getDate()) : 0);
    }

    // startedAt (optional): when Start was tapped, for the workout stopwatch.
    public static class CreateSessionBody {
        private Instant startedAt;
        public Instant getStartedAt() { return startedAt; }
        public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }
    }

    @PostMapping("/workouts/{workoutId}/sessions")
    public Session createSession(@PathVariable Long workoutId,
                                 @RequestBody(required = false) CreateSessionBody body) {
        return sessionService.createSession(workoutId, body != null ? body.getStartedAt() : null);
    }

    /* finishedAt (optional): when the workout ended, if not now (auto-end).
       exerciseIds (optional): exactly the exercises done today, in order,
       when they differ from the workout's (added, replaced or removed during
       the workout); it wins over orderedExerciseIds. updateWorkout: also
       make the workout's own list match exerciseIds, from now on. */
    public static class FinishBody {
        private List<Long> orderedExerciseIds;
        private List<Long> exerciseIds;
        private boolean updateWorkout;
        private Instant finishedAt;
        public List<Long> getOrderedExerciseIds() { return orderedExerciseIds; }
        public void setOrderedExerciseIds(List<Long> orderedExerciseIds) { this.orderedExerciseIds = orderedExerciseIds; }
        public List<Long> getExerciseIds() { return exerciseIds; }
        public void setExerciseIds(List<Long> exerciseIds) { this.exerciseIds = exerciseIds; }
        public boolean isUpdateWorkout() { return updateWorkout; }
        public void setUpdateWorkout(boolean updateWorkout) { this.updateWorkout = updateWorkout; }
        public Instant getFinishedAt() { return finishedAt; }
        public void setFinishedAt(Instant finishedAt) { this.finishedAt = finishedAt; }
    }

    @PostMapping("/sessions/{sessionId}/finish")
    public Session finishSession(@PathVariable Long sessionId, @RequestBody(required = false) FinishBody body) {
        if (body == null) return sessionService.finishSession(sessionId, null, null);
        if (body.getExerciseIds() != null) {
            return sessionService.finishWithExercises(sessionId, body.getExerciseIds(),
                body.isUpdateWorkout(), body.getFinishedAt());
        }
        return sessionService.finishSession(sessionId, body.getOrderedExerciseIds(), body.getFinishedAt());
    }

    public static class ExerciseListBody {
        private List<Long> exerciseIds;
        public List<Long> getExerciseIds() { return exerciseIds; }
        public void setExerciseIds(List<Long> exerciseIds) { this.exerciseIds = exerciseIds; }
    }

    /* The workout's exercises become exactly these, in order: "Update the
       workout from now on" at the end of a live workout with nothing
       logged (no session to finish). */
    @PutMapping("/workouts/{workoutId}/exercise-list")
    public ResponseEntity<Void> setWorkoutExerciseList(@PathVariable Long workoutId, @RequestBody ExerciseListBody body) {
        sessionService.setWorkoutList(workoutId, body.getExerciseIds());
        return ResponseEntity.noContent().build();
    }

    // 404 for another account's session, as for a missing one.
    @GetMapping("/sessions/{sessionId}")
    public Session getSession(@PathVariable Long sessionId) {
        return sessionService.findSession(sessionId);
    }

    @GetMapping("/sessions/{sessionId}/exercises")
    public List<SessionExercise> getSessionExercises(@PathVariable Long sessionId) {
        return sessionService.findSessionExercises(sessionId);
    }

    @DeleteMapping("/sessions/{sessionId}")
    public void deleteSession(@PathVariable Long sessionId) {
        sessionService.deleteSession(sessionId);
    }

    public static class SessionTotals {
        private int exercises;
        private int sets;
        private int reps;
        private double volume;
        private int durationSeconds;   // Time and Distance & time sets
        private double distanceKm;

        public int getExercises() { return exercises; }
        public int getSets() { return sets; }
        public int getReps() { return reps; }
        public double getVolume() { return volume; }
        public int getDurationSeconds() { return durationSeconds; }
        public double getDistanceKm() { return distanceKm; }

        public void setExercises(int exercises) { this.exercises = exercises; }
        public void setSets(int sets) { this.sets = sets; }
        public void setReps(int reps) { this.reps = reps; }
        public void setVolume(double volume) { this.volume = volume; }
        public void setDurationSeconds(int durationSeconds) { this.durationSeconds = durationSeconds; }
        public void setDistanceKm(double distanceKm) { this.distanceKm = distanceKm; }
    }

    @GetMapping("/workouts/{workoutId}/sessions/{sessionId}/previous-totals")
    public ResponseEntity<SessionTotals> getPreviousTotals(
        @PathVariable Long workoutId,
        @PathVariable Long sessionId
    ) {
        Optional<SessionTotals> totals = sessionService.findPreviousTotals(workoutId, sessionId);
        return totals.map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
    }
}
