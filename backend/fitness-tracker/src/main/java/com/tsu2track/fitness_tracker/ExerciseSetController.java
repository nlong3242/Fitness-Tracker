package com.tsu2track.fitness_tracker;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.tsu2track.fitness_tracker.dto.CreateSetRequest;
import com.tsu2track.fitness_tracker.dto.UpdateSetRequest;
import com.tsu2track.fitness_tracker.service.SessionService;

import jakarta.validation.Valid;

@RestController
public class ExerciseSetController {
    private final SessionService sessionService;

    public ExerciseSetController(SessionService sessionService) {
        this.sessionService = sessionService;
    }

    @GetMapping("/sessions/{sessionId}/sets")
    public List<ExerciseSet> getSets(@PathVariable Long sessionId) {
        return sessionService.findSetsBySession(sessionId);
    }

    @GetMapping("/workouts/{workoutId}/exercises/{exerciseId}/last-sets")
    public List<ExerciseSet> getLastSets(
        @PathVariable Long workoutId,
        @PathVariable Long exerciseId,
        @RequestParam(required = false) Long beforeSessionId
    ) {
        return sessionService.findLastSets(workoutId, exerciseId, beforeSessionId);
    }

    // The last time the exercise was done in any workout (sets, date, the
    // workout's name); 204 if never.
    @GetMapping("/exercises/{exerciseId}/last-done")
    public ResponseEntity<SessionService.LastDone> getLastDone(
        @PathVariable Long exerciseId,
        @RequestParam(required = false) Long beforeSessionId
    ) {
        return sessionService.findLastDone(exerciseId, beforeSessionId)
            .map(ResponseEntity::ok)
            .orElseGet(() -> ResponseEntity.noContent().build());
    }

    // What Reset exercise would delete (sets, sessions they're in), for its question.
    @GetMapping("/exercises/{exerciseId}/history/count")
    public SessionService.HistoryCount countHistory(@PathVariable Long exerciseId) {
        return sessionService.countExerciseHistory(exerciseId);
    }

    // Reset exercise: deletes the account's finished history of it
    // (SessionService.resetExerciseHistory); answers what went.
    @DeleteMapping("/exercises/{exerciseId}/history")
    public SessionService.HistoryCount resetHistory(@PathVariable Long exerciseId) {
        return sessionService.resetExerciseHistory(exerciseId);
    }

    @PostMapping("/sessions/{sessionId}/sets")
    public ExerciseSet createSet(@RequestBody @Valid CreateSetRequest body, @RequestParam Long exerciseId, @PathVariable Long sessionId) {
        return sessionService.createSet(sessionId, exerciseId, body);
    }

    @PutMapping("/sets/{setId}")
    public ExerciseSet updateSet(@PathVariable Long setId, @RequestBody @Valid UpdateSetRequest body) {
        return sessionService.updateSet(setId, body);
    }

    @DeleteMapping("/sets/{setId}")
    public void deleteSet(@PathVariable Long setId) {
        sessionService.deleteSet(setId);
    }
}
