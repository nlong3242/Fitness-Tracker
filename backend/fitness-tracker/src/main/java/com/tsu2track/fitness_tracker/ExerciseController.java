package com.tsu2track.fitness_tracker;


import java.util.List;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/workouts/{workoutId}/exercises")
public class ExerciseController {
    private final ExerciseRepository exerciseRepository;
    private final WorkoutRepository workoutRepository;

    public ExerciseController(ExerciseRepository exerciseRepository, WorkoutRepository workoutRepository){
        this.exerciseRepository = exerciseRepository;
        this.workoutRepository = workoutRepository;
    }
    
    @GetMapping
    public List<Exercise> getExercises(@PathVariable Long workoutId){
        return exerciseRepository.findByWorkout_Id(workoutId);
    }

    @PostMapping
    public Exercise createExercise(@RequestBody Exercise exercise, @PathVariable Long workoutId){
        if (exercise.getName() == null || exercise.getName().isBlank()) {
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

    @DeleteMapping("/{id}")
    public void deleteExercise(@PathVariable Long id){
        exerciseRepository.deleteById(id);
    }

}
