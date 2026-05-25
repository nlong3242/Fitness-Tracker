package com.tsu2track.fitness_tracker;


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

    public ExerciseController(ExerciseRepository exerciseRepository, WorkoutRepository workoutRepository){
        this.exerciseRepository = exerciseRepository;
        this.workoutRepository = workoutRepository;
    }

    @GetMapping("/workouts/{workoutId}/exercises")
    public List<Exercise> getExercises(@PathVariable Long workoutId){
        return exerciseRepository.findByWorkout_IdAndDeletedFalse(workoutId);
    }

    @GetMapping("/exercises/{id}")
    public Exercise getExercise(@PathVariable Long id){
        return exerciseRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found"));
    }

    @PostMapping("/workouts/{workoutId}/exercises")
    public Exercise createExercise(@RequestBody Exercise exercise, @PathVariable Long workoutId){
        if (exercise.getName() == null || exercise.getName().trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name is required");
        }
        if (exercise.getCategory() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Category is required");
        }
        Optional<Workout> workout = workoutRepository.findById(workoutId);
        boolean present = workout.isPresent();
        if (present){
            exercise.setWorkout(workout.get());
            return exerciseRepository.save(exercise);
        }
        return null;
    }

    @PutMapping("/workouts/{workoutId}/exercises/{id}")
    public Exercise updateExercise(@PathVariable Long workoutId, @PathVariable Long id, @RequestBody Exercise body){
        Exercise existing = exerciseRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found"));
        if (existing.isDeleted()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found");
        }
        if (body.getName() == null || body.getName().trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name is required");
        }
        if (body.getCategory() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Category is required");
        }
        existing.setName(body.getName());
        existing.setCategory(body.getCategory());
        existing.setPrimaryMuscleGroups(body.getPrimaryMuscleGroups());
        existing.setExerciseType(body.getExerciseType());
        existing.setCues(body.getCues());
        existing.setUnilateral(body.getUnilateral());
        return exerciseRepository.save(existing);
    }

    @DeleteMapping("/workouts/{workoutId}/exercises/{id}")
    public void deleteExercise(@PathVariable Long id){
        Optional<Exercise> existing = exerciseRepository.findById(id);
        if (existing.isPresent()) {
            Exercise exercise = existing.get();
            exercise.setDeleted(true);
            exerciseRepository.save(exercise);
        }
    }

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

}
