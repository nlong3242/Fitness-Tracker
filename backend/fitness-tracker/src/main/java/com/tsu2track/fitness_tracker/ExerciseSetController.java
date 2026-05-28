package com.tsu2track.fitness_tracker;

import java.util.List;

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

    @PostMapping("/sessions/{sessionId}/sets")
    public ExerciseSet createSet(@RequestBody ExerciseSet set, @RequestParam Long exerciseId, @PathVariable Long sessionId) {
        return sessionService.createSet(sessionId, exerciseId, set);
    }

    @PutMapping("/sets/{setId}")
    public ExerciseSet updateSet(@PathVariable Long setId, @RequestBody ExerciseSet body) {
        return sessionService.updateSet(setId, body);
    }

    @DeleteMapping("/sets/{setId}")
    public void deleteSet(@PathVariable Long setId) {
        sessionService.deleteSet(setId);
    }
}
