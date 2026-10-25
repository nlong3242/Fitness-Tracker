package com.tsu2track.fitness_tracker;


import java.util.List;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.tsu2track.fitness_tracker.dto.CreateExerciseRequest;
import com.tsu2track.fitness_tracker.dto.UpdateExerciseRequest;
import com.tsu2track.fitness_tracker.service.ExerciseService;

import jakarta.validation.Valid;

@RestController
public class ExerciseController {
    private final ExerciseService exerciseService;

    public ExerciseController(ExerciseService exerciseService) {
        this.exerciseService = exerciseService;
    }

    // ----- Library endpoints -----

    @GetMapping("/exercises")
    public List<Exercise> getAllExercises() {
        return exerciseService.findAll();
    }

    @GetMapping("/exercises/{id}")
    public Exercise getExercise(@PathVariable Long id) {
        return exerciseService.findById(id);
    }

    // A Custom copy of a built-in exercise that takes over from it (see ExerciseService).
    @PostMapping("/exercises/{id}/copy")
    public Exercise copyBuiltInExercise(@PathVariable Long id) {
        return exerciseService.copyBuiltIn(id);
    }

    @PostMapping("/exercises")
    public Exercise createLibraryExercise(@RequestBody @Valid CreateExerciseRequest req) {
        return exerciseService.create(req);
    }

    @PutMapping("/exercises/{id}")
    public Exercise updateLibraryExercise(@PathVariable Long id, @RequestBody @Valid UpdateExerciseRequest body) {
        return exerciseService.update(id, body);
    }

    @DeleteMapping("/exercises/{id}")
    public void deleteLibraryExercise(@PathVariable Long id) {
        exerciseService.softDelete(id);
    }

    // ----- Workout-scoped endpoints -----

    @GetMapping("/workouts/{workoutId}/exercises")
    public List<Exercise> getWorkoutExercises(@PathVariable Long workoutId) {
        return exerciseService.findByWorkout(workoutId);
    }

    @PostMapping("/workouts/{workoutId}/exercises")
    public Exercise createAndLinkExercise(@RequestBody @Valid CreateExerciseRequest req, @PathVariable Long workoutId) {
        return exerciseService.createAndLinkToWorkout(workoutId, req);
    }

    @PostMapping("/workouts/{workoutId}/exercises/{exerciseId}/link")
    public Exercise linkExerciseToWorkout(@PathVariable Long workoutId, @PathVariable Long exerciseId) {
        return exerciseService.linkToWorkout(workoutId, exerciseId);
    }

    @PutMapping("/workouts/{workoutId}/exercises/{id}")
    public Exercise updateExerciseFromWorkout(@PathVariable Long workoutId, @PathVariable Long id, @RequestBody @Valid UpdateExerciseRequest body) {
        return exerciseService.update(id, body);
    }

    @DeleteMapping("/workouts/{workoutId}/exercises/{id}")
    public void unlinkExerciseFromWorkout(@PathVariable Long workoutId, @PathVariable Long id) {
        exerciseService.unlinkFromWorkout(workoutId, id);
    }

    public static class OrderBody {
        private List<Long> orderedExerciseIds;
        public List<Long> getOrderedExerciseIds() { return orderedExerciseIds; }
        public void setOrderedExerciseIds(List<Long> orderedExerciseIds) { this.orderedExerciseIds = orderedExerciseIds; }
    }

    @PatchMapping("/workouts/{workoutId}/exercises/order")
    public void reorderWorkoutExercises(@PathVariable Long workoutId, @RequestBody OrderBody body) {
        exerciseService.reorder(workoutId, body.getOrderedExerciseIds());
    }

    // ----- Notes -----

    public static class NoteBody {
        private String content;
        public String getContent() { return content; }
        public void setContent(String content) { this.content = content; }
    }

    @PutMapping("/exercises/{id}/note")
    public Exercise updateNote(@PathVariable Long id, @RequestBody NoteBody body) {
        return exerciseService.updateNote(id, body.getContent());
    }
}
