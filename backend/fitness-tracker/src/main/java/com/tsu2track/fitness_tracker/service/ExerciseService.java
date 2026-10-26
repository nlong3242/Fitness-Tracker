package com.tsu2track.fitness_tracker.service;

import java.util.ArrayList;
import java.util.Comparator;
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
import com.tsu2track.fitness_tracker.ExerciseCategory;
import com.tsu2track.fitness_tracker.ExerciseRepository;
import com.tsu2track.fitness_tracker.LogType;
import com.tsu2track.fitness_tracker.SessionRepository;
import com.tsu2track.fitness_tracker.Workout;
import com.tsu2track.fitness_tracker.WorkoutExercise;
import com.tsu2track.fitness_tracker.WorkoutExerciseRepository;
import com.tsu2track.fitness_tracker.WorkoutRepository;
import com.tsu2track.fitness_tracker.dto.CreateExerciseRequest;
import com.tsu2track.fitness_tracker.dto.UpdateExerciseRequest;
import com.tsu2track.fitness_tracker.security.CurrentUser;

import jakarta.persistence.EntityManager;

/* Exercises are the account's own (Custom) or built-in (shared by every
   account, read-only). Either can be used: added to workouts, logged,
   looked at. Only Custom ones can be changed; a built-in one is copied
   first (copyBuiltIn), and "deleting" it hides it for this account. */
@Service
public class ExerciseService {
    private final ExerciseRepository exerciseRepository;
    private final WorkoutRepository workoutRepository;
    private final WorkoutExerciseRepository workoutExerciseRepository;
    private final SessionRepository sessionRepository;
    private final ExerciseNotes notes;
    private final HiddenExercises hidden;
    private final EntityManager entityManager;

    public ExerciseService(ExerciseRepository exerciseRepository,
                           WorkoutRepository workoutRepository,
                           WorkoutExerciseRepository workoutExerciseRepository,
                           SessionRepository sessionRepository,
                           ExerciseNotes notes,
                           HiddenExercises hidden,
                           EntityManager entityManager) {
        this.exerciseRepository = exerciseRepository;
        this.workoutRepository = workoutRepository;
        this.workoutExerciseRepository = workoutExerciseRepository;
        this.sessionRepository = sessionRepository;
        this.notes = notes;
        this.hidden = hidden;
        this.entityManager = entityManager;
    }

    // A row of the library list: just enough to list, search and filter.
    // The rest (cues, notes, ...) comes with findById when one is opened,
    // so the list of hundreds stays small.
    public record ListItem(Long id, String name, ExerciseCategory category, boolean builtIn) {}

    // The library: Custom and built-in together (less the hidden ones), A-Z.
    public List<ListItem> findAll() {
        Long userId = CurrentUser.id();
        Set<Long> hiddenIds = hidden.ids(userId);
        List<Exercise> all = new ArrayList<>(exerciseRepository.findByUserIdAndDeletedFalseOrderByNameAsc(userId));
        for (Exercise builtIn : exerciseRepository.findByBuiltInTrueAndDeletedFalseOrderByNameAsc()) {
            if (!hiddenIds.contains(builtIn.getId())) all.add(builtIn);
        }
        all.sort(Comparator.comparing(Exercise::getName, String.CASE_INSENSITIVE_ORDER));
        return all.stream()
            .map(e -> new ListItem(e.getId(), e.getName(), e.getCategory(), e.isBuiltIn()))
            .toList();
    }

    public Exercise findById(Long id) {
        Exercise exercise = usableExercise(id);
        notes.show(CurrentUser.id(), exercise);
        return exercise;
    }

    public Exercise create(CreateExerciseRequest req) {
        return exerciseRepository.save(buildExercise(req));
    }

    public Exercise update(Long id, UpdateExerciseRequest body) {
        Exercise existing = changeableExercise(id);
        if (existing.isDeleted()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found");
        }
        existing.setName(body.name());
        existing.setCategory(body.category());
        existing.setPrimaryMuscleGroups(body.primaryMuscleGroups());
        existing.setExerciseType(body.exerciseType());
        existing.setEquipment(body.equipment());
        existing.setCues(body.cues());
        existing.setUnilateral(body.unilateral());
        LogType current = existing.getPendingLogType() != null ? existing.getPendingLogType() : existing.getLogType();
        changeLogType(existing, logTypeFor(body.category(), body.logType(), current));
        return exerciseRepository.save(existing);
    }

    /* A type change keeps the exercise's history, but it starts fresh: old
       sets keep their own type, and "last time" and records only look at
       the new one. While the exercise is in a workout being done, that
       workout keeps the old type: the change waits as pendingLogType and
       SessionService applies it when the workout is finished or discarded. */
    private void changeLogType(Exercise exercise, LogType wanted) {
        if (wanted == exercise.getLogType()) {
            exercise.setPendingLogType(null);
        } else if (sessionRepository.existsOpenSessionWith(CurrentUser.id(), exercise.getId())) {
            exercise.setPendingLogType(wanted);
        } else {
            exercise.setLogType(wanted);
            exercise.setPendingLogType(null);
        }
    }

    // Cardio is always Distance & time; elsewhere the request picks, or it stays as it was.
    private static LogType logTypeFor(ExerciseCategory category, LogType requested, LogType otherwise) {
        if (category == ExerciseCategory.CARDIO) return LogType.DISTANCE_TIME;
        return requested != null ? requested : otherwise;
    }

    public void softDelete(Long id) {
        Long userId = CurrentUser.id();
        Optional<Exercise> existing = exerciseRepository.findUsable(id, userId);
        if (existing.isEmpty()) return;
        Exercise exercise = existing.get();
        if (exercise.isBuiltIn()) {
            hidden.hide(userId, id);
            return;
        }
        exercise.setDeleted(true);
        exerciseRepository.save(exercise);
    }

    public Exercise updateNote(Long id, String content) {
        Long userId = CurrentUser.id();
        Exercise exercise = usableExercise(id);
        String note = content == null || content.isEmpty() ? null : content;
        if (exercise.isBuiltIn()) {
            notes.set(userId, id, note);
            exercise.setViewerNote(note);
            return exercise;
        }
        exercise.setNotes(note);
        return exerciseRepository.save(exercise);
    }

    /* A Custom copy of a built-in exercise, to change as the user likes. It
       takes over from the built-in one for this account: their workouts,
       logged sets, past-session entries and note move to the copy. The
       built-in one stays in their list, unused. */
    @Transactional
    public Exercise copyBuiltIn(Long id) {
        Long userId = CurrentUser.id();
        Exercise original = usableExercise(id);
        if (!original.isBuiltIn()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only built-in exercises are copied");
        }
        Exercise copy = new Exercise();
        copy.setName(original.getName());
        copy.setCategory(original.getCategory());
        copy.setPrimaryMuscleGroups(original.getPrimaryMuscleGroups());
        copy.setExerciseType(original.getExerciseType());
        copy.setCues(original.getCues());
        copy.setUnilateral(original.getUnilateral());
        copy.setEquipment(original.getEquipment());
        copy.setLevel(original.getLevel());
        copy.setLogType(original.getLogType());
        copy.setNotes(notes.get(userId, id));
        copy = exerciseRepository.saveAndFlush(copy);
        notes.set(userId, id, null);

        moveToCopy("update workout_exercise set exercise_id = ?1 where exercise_id = ?2"
            + " and workout_id in (select id from workout where user_id = ?3)", copy.getId(), id, userId);
        moveToCopy("update exercise_set set exercise_id = ?1 where exercise_id = ?2"
            + " and session_id in (select id from session where user_id = ?3)", copy.getId(), id, userId);
        moveToCopy("update session_exercise set exercise_id = ?1 where exercise_id = ?2"
            + " and session_id in (select id from session where user_id = ?3)", copy.getId(), id, userId);
        // Rows already loaded in this request still point at the built-in one.
        entityManager.clear();
        return copy;
    }

    private void moveToCopy(String sql, Long copyId, Long originalId, Long userId) {
        entityManager.createNativeQuery(sql)
            .setParameter(1, copyId)
            .setParameter(2, originalId)
            .setParameter(3, userId)
            .executeUpdate();
    }

    public List<Exercise> findByWorkout(Long workoutId) {
        ownedWorkout(workoutId);
        List<WorkoutExercise> joins = workoutExerciseRepository.findLiveByWorkoutId(workoutId);
        List<Exercise> result = new ArrayList<>(joins.size());
        for (WorkoutExercise we : joins) {
            result.add(we.getExercise());
        }
        notes.show(CurrentUser.id(), result);
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
        Exercise exercise = usableExercise(exerciseId);
        if (exercise.isDeleted()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found");
        }
        Optional<WorkoutExercise> existing = workoutExerciseRepository.findByWorkout_IdAndExercise_Id(workoutId, exerciseId);
        if (existing.isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Exercise already in workout");
        }
        int nextPosition = workoutExerciseRepository.findMaxPositionForWorkout(workoutId) + 1;
        workoutExerciseRepository.save(new WorkoutExercise(workout, exercise, nextPosition));
        notes.show(CurrentUser.id(), exercise);
        return exercise;
    }

    public void unlinkFromWorkout(Long workoutId, Long exerciseId) {
        ownedWorkout(workoutId);
        Optional<WorkoutExercise> link = workoutExerciseRepository.findByWorkout_IdAndExercise_Id(workoutId, exerciseId);
        link.ifPresent(workoutExerciseRepository::delete);
    }

    // Swaps the exercise on the workout's link, so the new one takes the
    // old one's place in the order. Past sessions keep their snapshots.
    @Transactional
    public void replaceInWorkout(Long workoutId, Long exerciseId, Long replacementId) {
        ownedWorkout(workoutId);
        WorkoutExercise link = workoutExerciseRepository.findByWorkout_IdAndExercise_Id(workoutId, exerciseId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not in workout"));
        Exercise replacement = usableExercise(replacementId);
        if (replacement.isDeleted()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found");
        }
        if (workoutExerciseRepository.findByWorkout_IdAndExercise_Id(workoutId, replacementId).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Exercise already in workout");
        }
        link.setExercise(replacement);
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

    private Exercise usableExercise(Long exerciseId) {
        return exerciseRepository.findUsable(exerciseId, CurrentUser.id())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found"));
    }

    // Only Custom exercises change; a built-in one says so (the app offers a copy).
    private Exercise changeableExercise(Long exerciseId) {
        Exercise exercise = usableExercise(exerciseId);
        if (exercise.isBuiltIn()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Built-in exercises can't be changed");
        }
        return exercise;
    }

    private Exercise buildExercise(CreateExerciseRequest req) {
        Exercise exercise = new Exercise();
        exercise.setName(req.name());
        exercise.setCategory(req.category());
        exercise.setPrimaryMuscleGroups(req.primaryMuscleGroups());
        exercise.setExerciseType(req.exerciseType());
        exercise.setEquipment(req.equipment());
        exercise.setCues(req.cues());
        exercise.setNotes(req.notes());
        exercise.setUnilateral(req.unilateral());
        exercise.setLogType(logTypeFor(req.category(), req.logType(), LogType.WEIGHT_REPS));
        return exercise;
    }
}
