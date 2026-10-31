package com.tsu2track.fitness_tracker.service;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.tsu2track.fitness_tracker.RepeatDayClearedRepository;
import com.tsu2track.fitness_tracker.Workout;
import com.tsu2track.fitness_tracker.WorkoutController;
import com.tsu2track.fitness_tracker.WorkoutExerciseRepository;
import com.tsu2track.fitness_tracker.WorkoutRepeatRepository;
import com.tsu2track.fitness_tracker.WorkoutRepository;
import com.tsu2track.fitness_tracker.security.CurrentUser;

@Service
public class WorkoutService {
    private final WorkoutRepository workoutRepository;
    private final WorkoutExerciseRepository workoutExerciseRepository;
    private final WorkoutRepeatRepository workoutRepeatRepository;
    private final RepeatDayClearedRepository repeatDayClearedRepository;

    public WorkoutService(WorkoutRepository workoutRepository,
                          WorkoutExerciseRepository workoutExerciseRepository,
                          WorkoutRepeatRepository workoutRepeatRepository,
                          RepeatDayClearedRepository repeatDayClearedRepository) {
        this.workoutRepository = workoutRepository;
        this.workoutExerciseRepository = workoutExerciseRepository;
        this.workoutRepeatRepository = workoutRepeatRepository;
        this.repeatDayClearedRepository = repeatDayClearedRepository;
    }

    public List<WorkoutController.WorkoutSummary> findAllSummaries() {
        return workoutRepository.findByUserIdOrderByIdAsc(CurrentUser.id()).stream()
            .map(this::toSummary)
            .collect(Collectors.toList());
    }

    public WorkoutController.WorkoutSummary create(String name) {
        Workout saved = workoutRepository.save(new Workout(name));
        return toSummary(saved);
    }

    @Transactional
    public void delete(Long id) {
        Workout workout = workoutRepository.findByIdAndUserId(id, CurrentUser.id())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Workout not found"));
        // Explicitly, not only by cascade: a Workout already loaded before its
        // rules were added wouldn't know about them.
        workoutRepeatRepository.deleteAll(workoutRepeatRepository.findByWorkout_IdOrderByStartDateAsc(id));
        repeatDayClearedRepository.deleteAll(repeatDayClearedRepository.findByWorkout_Id(id));
        workoutRepository.delete(workout);
    }

    private WorkoutController.WorkoutSummary toSummary(Workout w) {
        return new WorkoutController.WorkoutSummary(
            w.getId(),
            w.getName(),
            workoutExerciseRepository.countLiveByWorkoutId(w.getId())
        );
    }
}
