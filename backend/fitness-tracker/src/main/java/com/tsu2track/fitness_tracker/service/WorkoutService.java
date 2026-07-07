package com.tsu2track.fitness_tracker.service;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.tsu2track.fitness_tracker.Workout;
import com.tsu2track.fitness_tracker.WorkoutController;
import com.tsu2track.fitness_tracker.WorkoutExerciseRepository;
import com.tsu2track.fitness_tracker.WorkoutRepository;

@Service
public class WorkoutService {
    private final WorkoutRepository workoutRepository;
    private final WorkoutExerciseRepository workoutExerciseRepository;

    public WorkoutService(WorkoutRepository workoutRepository,
                          WorkoutExerciseRepository workoutExerciseRepository) {
        this.workoutRepository = workoutRepository;
        this.workoutExerciseRepository = workoutExerciseRepository;
    }

    public List<WorkoutController.WorkoutSummary> findAllSummaries() {
        return workoutRepository.findAll().stream()
            .map(this::toSummary)
            .collect(Collectors.toList());
    }

    public WorkoutController.WorkoutSummary create(String name) {
        Workout saved = workoutRepository.save(new Workout(name));
        return toSummary(saved);
    }

    public void delete(Long id) {
        if (!workoutRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Workout not found");
        }
        workoutRepository.deleteById(id);
    }

    private WorkoutController.WorkoutSummary toSummary(Workout w) {
        return new WorkoutController.WorkoutSummary(
            w.getId(),
            w.getName(),
            workoutExerciseRepository.countLiveByWorkoutId(w.getId())
        );
    }
}
