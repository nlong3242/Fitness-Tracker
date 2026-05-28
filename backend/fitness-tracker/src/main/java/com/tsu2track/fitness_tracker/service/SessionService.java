package com.tsu2track.fitness_tracker.service;

import java.time.LocalDate;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.tsu2track.fitness_tracker.Exercise;
import com.tsu2track.fitness_tracker.ExerciseRepository;
import com.tsu2track.fitness_tracker.ExerciseSet;
import com.tsu2track.fitness_tracker.ExerciseSetRepository;
import com.tsu2track.fitness_tracker.Session;
import com.tsu2track.fitness_tracker.SessionController;
import com.tsu2track.fitness_tracker.SessionExercise;
import com.tsu2track.fitness_tracker.SessionExerciseRepository;
import com.tsu2track.fitness_tracker.SessionRepository;
import com.tsu2track.fitness_tracker.Workout;
import com.tsu2track.fitness_tracker.WorkoutExercise;
import com.tsu2track.fitness_tracker.WorkoutExerciseRepository;
import com.tsu2track.fitness_tracker.WorkoutRepository;

@Service
public class SessionService {
    private final SessionRepository sessionRepository;
    private final WorkoutRepository workoutRepository;
    private final ExerciseRepository exerciseRepository;
    private final ExerciseSetRepository exerciseSetRepository;
    private final SessionExerciseRepository sessionExerciseRepository;
    private final WorkoutExerciseRepository workoutExerciseRepository;

    public SessionService(SessionRepository sessionRepository,
                          WorkoutRepository workoutRepository,
                          ExerciseRepository exerciseRepository,
                          ExerciseSetRepository exerciseSetRepository,
                          SessionExerciseRepository sessionExerciseRepository,
                          WorkoutExerciseRepository workoutExerciseRepository) {
        this.sessionRepository = sessionRepository;
        this.workoutRepository = workoutRepository;
        this.exerciseRepository = exerciseRepository;
        this.exerciseSetRepository = exerciseSetRepository;
        this.sessionExerciseRepository = sessionExerciseRepository;
        this.workoutExerciseRepository = workoutExerciseRepository;
    }

    public Page<Session> findSessions(Long workoutId, Pageable pageable) {
        return sessionRepository.findByWorkout_IdOrderByDateDescIdDesc(workoutId, pageable);
    }

    public Session createSession(Long workoutId) {
        Optional<Workout> workout = workoutRepository.findById(workoutId);
        if (!workout.isPresent()) {
            return null;
        }
        Session session = new Session();
        session.setDate(LocalDate.now());
        session.setWorkout(workout.get());
        return sessionRepository.save(session);
    }

    @Transactional
    public Session finishSession(Long sessionId, List<Long> orderedExerciseIds) {
        Session session = sessionRepository.findById(sessionId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found"));
        if (session.isFinished()) {
            return session;
        }

        Long workoutId = session.getWorkoutId();
        List<WorkoutExercise> currentJoins = workoutExerciseRepository.findLiveByWorkoutId(workoutId);
        List<ExerciseSet> sessionSets = exerciseSetRepository.findBySession_Id(sessionId);

        Map<Long, Exercise> currentById = new LinkedHashMap<>();
        for (WorkoutExercise we : currentJoins) {
            currentById.put(we.getExercise().getId(), we.getExercise());
        }

        Map<Long, Exercise> exercisesById = new LinkedHashMap<>();
        if (orderedExerciseIds != null) {
            for (Long id : orderedExerciseIds) {
                Exercise ex = currentById.get(id);
                if (ex != null) exercisesById.put(id, ex);
            }
            for (Map.Entry<Long, Exercise> e : currentById.entrySet()) {
                if (!exercisesById.containsKey(e.getKey())) {
                    exercisesById.put(e.getKey(), e.getValue());
                }
            }
        } else {
            exercisesById.putAll(currentById);
        }

        for (ExerciseSet set : sessionSets) {
            Long exId = set.getExerciseId();
            if (exId != null && !exercisesById.containsKey(exId)) {
                Optional<Exercise> ex = exerciseRepository.findById(exId);
                if (ex.isPresent()) {
                    exercisesById.put(exId, ex.get());
                }
            }
        }

        int position = 0;
        for (Exercise ex : exercisesById.values()) {
            SessionExercise snapshot = new SessionExercise();
            snapshot.setSession(session);
            snapshot.setExercise(ex);
            snapshot.setPosition(position++);
            snapshot.setName(ex.getName());
            snapshot.setCategory(ex.getCategory());
            snapshot.setPrimaryMuscleGroups(ex.getPrimaryMuscleGroups());
            snapshot.setExerciseType(ex.getExerciseType());
            snapshot.setCues(ex.getCues());
            snapshot.setUnilateral(ex.getUnilateral());
            sessionExerciseRepository.save(snapshot);
        }

        session.setFinished(true);
        return sessionRepository.save(session);
    }

    public void deleteSession(Long sessionId) {
        Optional<Session> session = sessionRepository.findById(sessionId);
        if (session.isPresent() && session.get().isFinished()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cannot delete a finished session");
        }
        sessionRepository.deleteById(sessionId);
    }

    public List<SessionExercise> findSessionExercises(Long sessionId) {
        if (!sessionRepository.existsById(sessionId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found");
        }
        return sessionExerciseRepository.findBySession_IdOrderByPositionAsc(sessionId);
    }

    public Optional<SessionController.SessionTotals> findPreviousTotals(Long workoutId, Long sessionId) {
        Session current = sessionRepository.findById(sessionId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found"));
        Optional<Session> previous = sessionRepository.findPreviousSession(workoutId, current.getDate(), sessionId);
        if (!previous.isPresent()) {
            return Optional.empty();
        }

        List<ExerciseSet> sets = exerciseSetRepository.findBySession_Id(previous.get().getId());
        java.util.Set<Long> uniqueExercises = new HashSet<>();
        int repsTotal = 0;
        double volumeTotal = 0;
        for (ExerciseSet set : sets) {
            uniqueExercises.add(set.getExerciseId());
            repsTotal += set.getReps();
            volumeTotal += set.getWeight() * set.getReps();
        }

        SessionController.SessionTotals totals = new SessionController.SessionTotals();
        totals.setExercises(uniqueExercises.size());
        totals.setSets(sets.size());
        totals.setReps(repsTotal);
        totals.setVolume(volumeTotal);
        return Optional.of(totals);
    }

    public List<ExerciseSet> findSetsBySession(Long sessionId) {
        return exerciseSetRepository.findBySession_Id(sessionId);
    }

    public List<ExerciseSet> findLastSets(Long workoutId, Long exerciseId, Long beforeSessionId) {
        LocalDate beforeDate = null;
        if (beforeSessionId != null) {
            Optional<Session> anchor = sessionRepository.findById(beforeSessionId);
            if (!anchor.isPresent()) {
                return Collections.emptyList();
            }
            beforeDate = anchor.get().getDate();
        }
        return exerciseSetRepository.findLastSetsForExercise(workoutId, exerciseId, beforeSessionId, beforeDate);
    }

    public ExerciseSet createSet(Long sessionId, Long exerciseId, ExerciseSet set) {
        Optional<Session> session = sessionRepository.findById(sessionId);
        Optional<Exercise> exercise = exerciseRepository.findById(exerciseId);
        if (session.isPresent() && exercise.isPresent()) {
            if (session.get().isFinished()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Session is finished");
            }
            boolean isUnilateral = Boolean.TRUE.equals(exercise.get().getUnilateral());
            if (isUnilateral && set.getSide() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Side is required for unilateral exercises");
            }
            if (!isUnilateral && set.getSide() != null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Side must not be set for bilateral exercises");
            }
            set.setExercise(exercise.get());
            set.setSession(session.get());
            return exerciseSetRepository.save(set);
        }
        return null;
    }

    public ExerciseSet updateSet(Long setId, ExerciseSet body) {
        Optional<ExerciseSet> existing = exerciseSetRepository.findById(setId);
        if (existing.isPresent()) {
            ExerciseSet set = existing.get();
            if (set.getSession() != null && set.getSession().isFinished()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Session is finished");
            }
            set.setWeight(body.getWeight());
            set.setReps(body.getReps());
            return exerciseSetRepository.save(set);
        }
        return null;
    }

    public void deleteSet(Long setId) {
        Optional<ExerciseSet> existing = exerciseSetRepository.findById(setId);
        if (existing.isPresent() && existing.get().getSession() != null && existing.get().getSession().isFinished()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Session is finished");
        }
        exerciseSetRepository.deleteById(setId);
    }
}
