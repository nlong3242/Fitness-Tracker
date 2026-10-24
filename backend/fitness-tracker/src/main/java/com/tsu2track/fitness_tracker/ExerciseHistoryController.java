package com.tsu2track.fitness_tracker;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.tsu2track.fitness_tracker.service.ExerciseHistoryService;

@RestController
public class ExerciseHistoryController {
    private static final int MAX_PAGE_SIZE = 50;

    private final ExerciseHistoryService exerciseHistoryService;

    public ExerciseHistoryController(ExerciseHistoryService exerciseHistoryService) {
        this.exerciseHistoryService = exerciseHistoryService;
    }

    // PRs plus one page of past sessions (newest first); 404 for an unknown exercise.
    @GetMapping("/exercises/{exerciseId}/history")
    public ExerciseHistoryService.History getHistory(
        @PathVariable Long exerciseId,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "10") int size
    ) {
        return exerciseHistoryService.history(exerciseId, Math.max(page, 0), Math.clamp(size, 1, MAX_PAGE_SIZE));
    }
}
