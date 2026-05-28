package com.tsu2track.fitness_tracker;


import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.tsu2track.fitness_tracker.dto.CreateExerciseRequest;
import com.tsu2track.fitness_tracker.dto.UpdateExerciseRequest;

import jakarta.validation.Valid;

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
    public Exercise createLibraryExercise(@RequestBody @Valid CreateExerciseRequest req) {
        return exerciseRepository.save(buildExercise(req));
    }

    @PutMapping("/exercises/{id}")
    public Exercise updateLibraryExercise(@PathVariable Long id, @RequestBody @Valid UpdateExerciseRequest body) {
        Exercise existing = exerciseRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found"));
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
    public Exercise createAndLinkExercise(@RequestBody @Valid CreateExerciseRequest req, @PathVariable Long workoutId){
        Workout workout = workoutRepository.findById(workoutId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Workout not found"));
        Exercise saved = exerciseRepository.save(buildExercise(req));
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
    public Exercise updateExerciseFromWorkout(@PathVariable Long workoutId, @PathVariable Long id, @RequestBody @Valid UpdateExerciseRequest body){
        return updateLibraryExercise(id, body);
    }

    @DeleteMapping("/workouts/{workoutId}/exercises/{id}")
    public void unlinkExerciseFromWorkout(@PathVariable Long workoutId, @PathVariable Long id){
        Optional<WorkoutExercise> link = workoutExerciseRepository.findByWorkout_IdAndExercise_Id(workoutId, id);
        link.ifPresent(workoutExerciseRepository::delete);
    }

    public static class OrderBody {
        private List<Long> orderedExerciseIds;
        public List<Long> getOrderedExerciseIds() { return orderedExerciseIds; }
        public void setOrderedExerciseIds(List<Long> orderedExerciseIds) { this.orderedExerciseIds = orderedExerciseIds; }
    }

    @PatchMapping("/workouts/{workoutId}/exercises/order")
    @Transactional
    public void reorderWorkoutExercises(@PathVariable Long workoutId, @RequestBody OrderBody body) {
        List<Long> ordered = body.getOrderedExerciseIds();
        if (ordered == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "orderedExerciseIds is required");
        }
        List<WorkoutExercise> current = workoutExerciseRepository.findLiveByWorkoutId(workoutId);
        if (current.size() != ordered.size()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Order list does not match current exercises");
        }
        Map<Long, WorkoutExercise> byExerciseId = new HashMap<>();
        for (WorkoutExercise we : current) {
            byExerciseId.put(we.getExercise().getId(), we);
        }
        Set<Long> incoming = new HashSet<>(ordered);
        if (incoming.size() != ordered.size() || !byExerciseId.keySet().equals(incoming)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Order list does not match current exercises");
        }
        for (int i = 0; i < ordered.size(); i++) {
            byExerciseId.get(ordered.get(i)).setPosition(i);
        }
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
