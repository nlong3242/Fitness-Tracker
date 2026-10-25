package com.tsu2track.fitness_tracker.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.tsu2track.fitness_tracker.Exercise;
import com.tsu2track.fitness_tracker.ExerciseRepository;
import com.tsu2track.fitness_tracker.Workout;
import com.tsu2track.fitness_tracker.WorkoutExercise;
import com.tsu2track.fitness_tracker.WorkoutExerciseRepository;
import com.tsu2track.fitness_tracker.WorkoutRepository;
import com.tsu2track.fitness_tracker.dto.CreateExerciseRequest;
import com.tsu2track.fitness_tracker.dto.UpdateExerciseRequest;
import com.tsu2track.fitness_tracker.security.CurrentUser;

@Service
public class ExerciseService {
    private final ExerciseRepository exerciseRepository;
    private final WorkoutRepository workoutRepository;
    private final WorkoutExerciseRepository workoutExerciseRepository;

    public ExerciseService(ExerciseRepository exerciseRepository,
                           WorkoutRepository workoutRepository,
                           WorkoutExerciseRepository workoutExerciseRepository) {
        this.exerciseRepository = exerciseRepository;
        this.workoutRepository = workoutRepository;
        this.workoutExerciseRepository = workoutExerciseRepository;
    }

    public List<Exercise> findAll() {
        return exerciseRepository.findByUserIdAndDeletedFalseOrderByNameAsc(CurrentUser.id());
    }

    public Exercise findById(Long id) {
        return ownedExercise(id);
    }

    public Exercise create(CreateExerciseRequest req) {
        return exerciseRepository.save(buildExercise(req));
    }

    public Exercise update(Long id, UpdateExerciseRequest body) {
        Exercise existing = ownedExercise(id);
        if (existing.isDeleted()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found");
        }
        existing.setName(body.name());
        existing.setCategory(body.category());
        existing.setPrimaryMuscleGroups(body.primaryMuscleGroups());
        existing.setExerciseType(body.exerciseType());
        existing.setCues(body.cues());
        existing.setUnilateral(body.unilateral());
        return exerciseRepository.save(existing);
    }

    public void softDelete(Long id) {
        Optional<Exercise> existing = exerciseRepository.findByIdAndUserId(id, CurrentUser.id());
        if (existing.isPresent()) {
            Exercise exercise = existing.get();
            exercise.setDeleted(true);
            exerciseRepository.save(exercise);
        }
    }

    public Exercise updateNote(Long id, String content) {
        Exercise exercise = ownedExercise(id);
        exercise.setNotes(content == null || content.isEmpty() ? null : content);
        return exerciseRepository.save(exercise);
    }

    public List<Exercise> findByWorkout(Long workoutId) {
        ownedWorkout(workoutId);
        List<WorkoutExercise> joins = workoutExerciseRepository.findLiveByWorkoutId(workoutId);
        List<Exercise> result = new ArrayList<>(joins.size());
        for (WorkoutExercise we : joins) {
            result.add(we.getExercise());
        }
        return result;
    }

    public Exercise createAndLinkToWorkout(Long workoutId, CreateExerciseRequest req) {
        Workout workout = ownedWorkout(workoutId);
        Exercise saved = exerciseRepository.save(buildExercise(req));
        int nextPosition = workoutExerciseRepository.findMaxPositionForWorkout(workoutId) + 1;
        workoutExerciseRepository.save(new WorkoutExercise(workout, saved, nextPosition));
        return saved;
    }

    public Exercise linkToWorkout(Long workoutId, Long exerciseId) {
        Workout workout = ownedWorkout(workoutId);
        Exercise exercise = ownedExercise(exerciseId);
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

    public void unlinkFromWorkout(Long workoutId, Long exerciseId) {
        ownedWorkout(workoutId);
        Optional<WorkoutExercise> link = workoutExerciseRepository.findByWorkout_IdAndExercise_Id(workoutId, exerciseId);
        link.ifPresent(workoutExerciseRepository::delete);
    }

    @Transactional
    public void reorder(Long workoutId, List<Long> orderedExerciseIds) {
        if (orderedExerciseIds == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "orderedExerciseIds is required");
        }
        ownedWorkout(workoutId);
        List<WorkoutExercise> current = workoutExerciseRepository.findLiveByWorkoutId(workoutId);
        if (current.size() != orderedExerciseIds.size()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Order list does not match current exercises");
        }
        Map<Long, WorkoutExercise> byExerciseId = new HashMap<>();
        for (WorkoutExercise we : current) {
            byExerciseId.put(we.getExercise().getId(), we);
        }
        Set<Long> incoming = new HashSet<>(orderedExerciseIds);
        if (incoming.size() != orderedExerciseIds.size() || !byExerciseId.keySet().equals(incoming)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Order list does not match current exercises");
        }
        for (int i = 0; i < orderedExerciseIds.size(); i++) {
            byExerciseId.get(orderedExerciseIds.get(i)).setPosition(i);
        }
    }

    // Another account's workout or exercise is "not found", same as a missing one.
    private Workout ownedWorkout(Long workoutId) {
        return workoutRepository.findByIdAndUserId(workoutId, CurrentUser.id())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Workout not found"));
    }

    private Exercise ownedExercise(Long exerciseId) {
        return exerciseRepository.findByIdAndUserId(exerciseId, CurrentUser.id())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found"));
    }

    private Exercise buildExercise(CreateExerciseRequest req) {
        Exercise exercise = new Exercise();
        exercise.setName(req.name());
        exercise.setCategory(req.category());
        exercise.setPrimaryMuscleGroups(req.primaryMuscleGroups());
        exercise.setExerciseType(req.exerciseType());
        exercise.setCues(req.cues());
        exercise.setNotes(req.notes());
        exercise.setUnilateral(req.unilateral());
        return exercise;
    }
}
