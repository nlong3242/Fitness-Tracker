package com.tsu2track.fitness_tracker;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.tsu2track.fitness_tracker.service.SessionService;

@RestController
public class SessionController {
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
        return sessionService.findSessions(workoutId, PageRequest.of(page, size));
    }

    @PostMapping("/workouts/{workoutId}/sessions")
    public Session createSession(@PathVariable Long workoutId) {
        return sessionService.createSession(workoutId);
    }

    public static class FinishBody {
        private List<Long> orderedExerciseIds;
        public List<Long> getOrderedExerciseIds() { return orderedExerciseIds; }
        public void setOrderedExerciseIds(List<Long> orderedExerciseIds) { this.orderedExerciseIds = orderedExerciseIds; }
    }

    @PostMapping("/sessions/{sessionId}/finish")
    public Session finishSession(@PathVariable Long sessionId, @RequestBody(required = false) FinishBody body) {
        List<Long> orderedIds = body != null ? body.getOrderedExerciseIds() : null;
        return sessionService.finishSession(sessionId, orderedIds);
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

        public int getExercises() { return exercises; }
        public int getSets() { return sets; }
        public int getReps() { return reps; }
        public double getVolume() { return volume; }

        public void setExercises(int exercises) { this.exercises = exercises; }
        public void setSets(int sets) { this.sets = sets; }
        public void setReps(int reps) { this.reps = reps; }
        public void setVolume(double volume) { this.volume = volume; }
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
