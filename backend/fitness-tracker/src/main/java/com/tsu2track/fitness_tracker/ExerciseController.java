package com.tsu2track.fitness_tracker;


import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class ExerciseController {
    private final ExerciseRepository exerciseRepository;
    private final WorkoutRepository workoutRepository;
    private final WorkoutExerciseRepository workoutExerciseRepository;

    public ExerciseController(ExerciseRepository exerciseRepository,
        WorkoutRepository workoutRepository,
        WorkoutExerciseRepository workoutExerciseRepository) {
        this.exerciseRepository = exerciseRepository;
        this.workoutRepository = workoutRepository;
        this.workoutExerciseRepository = workoutExerciseRepository;
    }

    // ----- Library endpoints -----

    @GetMapping("/exercises")
    public List<Exercise> getAllExercises() {
        return exerciseRepository.findByDeletedFalseOrderByNameAsc();
    }

    @GetMapping("/exercises/{id}")
    public Exercise getExercise(@PathVariable Long id){
        return exerciseRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found"));
    }

    @PostMapping("/exercises")
    public Exercise createLibraryExercise(@RequestBody Exercise exercise) {
        validateExercisePayload(exercise);
        return exerciseRepository.save(exercise);
    }

    @PutMapping("/exercises/{id}")
    public Exercise updateLibraryExercise(@PathVariable Long id, @RequestBody Exercise body) {
        Exercise existing = exerciseRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found"));
        if (existing.isDeleted()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found");
        }
        validateExercisePayload(body);
        existing.setName(body.getName());
        existing.setCategory(body.getCategory());
        existing.setPrimaryMuscleGroups(body.getPrimaryMuscleGroups());
        existing.setExerciseType(body.getExerciseType());
        existing.setCues(body.getCues());
        existing.setUnilateral(body.getUnilateral());
        return exerciseRepository.save(existing);
    }

    @DeleteMapping("/exercises/{id}")
    public void deleteLibraryExercise(@PathVariable Long id) {
        Optional<Exercise> existing = exerciseRepository.findById(id);
        if (existing.isPresent()) {
            Exercise exercise = existing.get();
            exercise.setDeleted(true);
            exerciseRepository.save(exercise);
        }
    }

    // ----- Workout-scoped endpoints -----

    @GetMapping("/workouts/{workoutId}/exercises")
    public List<Exercise> getWorkoutExercises(@PathVariable Long workoutId){
        List<WorkoutExercise> joins = workoutExerciseRepository.findLiveByWorkoutId(workoutId);
        List<Exercise> result = new ArrayList<>(joins.size());
        for (WorkoutExercise we : joins) {
            result.add(we.getExercise());
        }
        return result;
    }

    @PostMapping("/workouts/{workoutId}/exercises")
    public Exercise createAndLinkExercise(@RequestBody Exercise exercise, @PathVariable Long workoutId){
        validateExercisePayload(exercise);
        Workout workout = workoutRepository.findById(workoutId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Workout not found"));
        Exercise saved = exerciseRepository.save(exercise);
        int nextPosition = workoutExerciseRepository.findMaxPositionForWorkout(workoutId) + 1;
        workoutExerciseRepository.save(new WorkoutExercise(workout, saved, nextPosition));
        return saved;
    }

    @PostMapping("/workouts/{workoutId}/exercises/{exerciseId}/link")
    public Exercise linkExerciseToWorkout(@PathVariable Long workoutId, @PathVariable Long exerciseId) {
        Workout workout = workoutRepository.findById(workoutId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Workout not found"));
        Exercise exercise = exerciseRepository.findById(exerciseId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found"));
        if (exercise.isDeleted()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found");
        }
        Optional<WorkoutExercise> existing = workoutExerciseRepository.findByWorkout_IdAndExercise_Id(workoutId, exerciseId);
        if (existing.isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Exercise already in workout");
        }
        int nextPosition = workoutExerciseRepository.findMaxPositionForWorkout(workoutId) + 1;
        workoutExerciseRepository.save(new WorkoutExercise(workout, exercise, nextPosition));
        return exercise;
    }

    @PutMapping("/workouts/{workoutId}/exercises/{id}")
    public Exercise updateExerciseFromWorkout(@PathVariable Long workoutId, @PathVariable Long id, @RequestBody Exercise body){
        return updateLibraryExercise(id, body);
    }

    @DeleteMapping("/workouts/{workoutId}/exercises/{id}")
    public void unlinkExerciseFromWorkout(@PathVariable Long workoutId, @PathVariable Long id){
        Optional<WorkoutExercise> link = workoutExerciseRepository.findByWorkout_IdAndExercise_Id(workoutId, id);
        link.ifPresent(workoutExerciseRepository::delete);
    }

    // ----- Notes -----

    public static class NoteBody {
        private String content;
        public String getContent() { return content; }
        public void setContent(String content) { this.content = content; }
    }

    @PutMapping("/exercises/{id}/note")
    public Exercise updateNote(@PathVariable Long id, @RequestBody NoteBody body){
        Exercise exercise = exerciseRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found"));
        String content = body.getContent();
        exercise.setNotes(content == null || content.isEmpty() ? null : content);
        return exerciseRepository.save(exercise);
    }

    private void validateExercisePayload(Exercise exercise) {
        if (exercise.getName() == null || exercise.getName().trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name is required");
        }
        if (exercise.getCategory() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Category is required");
        }
    }
}
