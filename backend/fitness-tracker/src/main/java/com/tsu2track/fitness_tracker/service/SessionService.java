package com.tsu2track.fitness_tracker.service;

import java.time.Instant;
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
import com.tsu2track.fitness_tracker.ScheduleStatus;
import com.tsu2track.fitness_tracker.ScheduledWorkout;
import com.tsu2track.fitness_tracker.ScheduledWorkoutRepository;
import com.tsu2track.fitness_tracker.Session;
import com.tsu2track.fitness_tracker.SessionController;
import com.tsu2track.fitness_tracker.SessionExercise;
import com.tsu2track.fitness_tracker.SessionExerciseRepository;
import com.tsu2track.fitness_tracker.SessionRepository;
import com.tsu2track.fitness_tracker.Workout;
import com.tsu2track.fitness_tracker.WorkoutExercise;
import com.tsu2track.fitness_tracker.WorkoutExerciseRepository;
import com.tsu2track.fitness_tracker.WorkoutRepository;
import com.tsu2track.fitness_tracker.dto.CreateSetRequest;
import com.tsu2track.fitness_tracker.dto.UpdateSetRequest;

@Service
public class SessionService {
    private final SessionRepository sessionRepository;
    private final WorkoutRepository workoutRepository;
    private final ExerciseRepository exerciseRepository;
    private final ExerciseSetRepository exerciseSetRepository;
    private final SessionExerciseRepository sessionExerciseRepository;
    private final WorkoutExerciseRepository workoutExerciseRepository;
    private final ScheduledWorkoutRepository scheduledWorkoutRepository;

    public SessionService(SessionRepository sessionRepository,
                          WorkoutRepository workoutRepository,
                          ExerciseRepository exerciseRepository,
                          ExerciseSetRepository exerciseSetRepository,
                          SessionExerciseRepository sessionExerciseRepository,
                          WorkoutExerciseRepository workoutExerciseRepository,
                          ScheduledWorkoutRepository scheduledWorkoutRepository) {
        this.sessionRepository = sessionRepository;
        this.workoutRepository = workoutRepository;
        this.exerciseRepository = exerciseRepository;
        this.exerciseSetRepository = exerciseSetRepository;
        this.sessionExerciseRepository = sessionExerciseRepository;
        this.workoutExerciseRepository = workoutExerciseRepository;
        this.scheduledWorkoutRepository = scheduledWorkoutRepository;
    }

    public Page<Session> findSessions(Long workoutId, Pageable pageable) {
        return sessionRepository.findByWorkout_IdOrderByDateDescIdDesc(workoutId, pageable);
    }

    /* The workout the user is still in the middle of (started, never
       finished), so the app can offer to resume it. Most recent wins. */
    public Optional<Session> findUnfinishedSession() {
        return sessionRepository.findFirstByFinishedFalseOrderByDateDescIdDesc();
    }

    // Home page stats. weekStart comes from the client so "this week" follows
    // the user's local calendar (Monday start, like the calendar view).
    public long countFinishedInWeek(LocalDate weekStart) {
        return sessionRepository.countByFinishedTrueAndDateBetween(weekStart, weekStart.plusDays(6));
    }

    public Optional<Session> findLastFinishedSession() {
        return sessionRepository.findFirstByFinishedTrueOrderByDateDescIdDesc();
    }

    /* Weeks in a row (Monday start) with at least one finished session,
       counting back from weekStart. A week with nothing yet doesn't break
       the streak while it's still the current one: it starts from last week. */
    public int countWeekStreak(LocalDate weekStart) {
        // Newest first, so each week's dates come in one run.
        List<LocalDate> dates = sessionRepository.findFinishedDatesUpTo(weekStart.plusDays(6));
        LocalDate week = weekStart;
        if (dates.isEmpty() || dates.get(0).isBefore(week)) {
            week = week.minusWeeks(1);
        }
        int streak = 0;
        int i = 0;
        while (i < dates.size() && !dates.get(i).isBefore(week)) {
            streak++;
            while (i < dates.size() && !dates.get(i).isBefore(week)) i++;
            week = week.minusWeeks(1);
        }
        return streak;
    }

    // The earliest workout still planned for today or later.
    public Optional<ScheduledWorkout> findNextPlanned(LocalDate today) {
        return scheduledWorkoutRepository
            .findFirstByStatusAndDateGreaterThanEqualOrderByDateAscCreatedAtAsc(ScheduleStatus.PLANNED, today);
    }

    // Plans still to do on a day (the next one included).
    public long countPlannedOn(LocalDate date) {
        return scheduledWorkoutRepository.countByStatusAndDate(ScheduleStatus.PLANNED, date);
    }

    public Session createSession(Long workoutId) {
        Optional<Workout> workout = workoutRepository.findById(workoutId);
        if (!workout.isPresent()) {
            return null;
        }
        Session session = new Session();
        session.setDate(LocalDate.now());
        session.setLastActivityAt(Instant.now());
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

    @Transactional
    public void deleteSession(Long sessionId) {
        Session session = sessionRepository.findById(sessionId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found"));
        // scheduled_workout.session_id has a plain FK to session; deleting a
        // linked session without unlinking first is a constraint violation.
        // The calendar entry itself (and its status) is left untouched.
        scheduledWorkoutRepository.findBySession_Id(sessionId).ifPresent(sw -> {
            sw.setSession(null);
            scheduledWorkoutRepository.save(sw);
        });
        sessionRepository.delete(session);
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

    public ExerciseSet createSet(Long sessionId, Long exerciseId, CreateSetRequest req) {
        Optional<Session> session = sessionRepository.findById(sessionId);
        Optional<Exercise> exercise = exerciseRepository.findById(exerciseId);
        if (session.isPresent() && exercise.isPresent()) {
            if (session.get().isFinished()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Session is finished");
            }
            boolean isUnilateral = Boolean.TRUE.equals(exercise.get().getUnilateral());
            if (isUnilateral && req.side() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Side is required for unilateral exercises");
            }
            if (!isUnilateral && req.side() != null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Side must not be set for bilateral exercises");
            }
            ExerciseSet set = new ExerciseSet();
            set.setWeight(req.weight());
            set.setReps(req.reps());
            set.setSide(req.side());
            set.setExercise(exercise.get());
            set.setSession(session.get());
            touch(session.get());
            return exerciseSetRepository.save(set);
        }
        return null;
    }

    public ExerciseSet updateSet(Long setId, UpdateSetRequest req) {
        Optional<ExerciseSet> existing = exerciseSetRepository.findById(setId);
        if (existing.isPresent()) {
            ExerciseSet set = existing.get();
            if (set.getSession() != null && set.getSession().isFinished()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Session is finished");
            }
            set.setWeight(req.weight());
            set.setReps(req.reps());
            if (set.getSession() != null) touch(set.getSession());
            return exerciseSetRepository.save(set);
        }
        return null;
    }

    public void deleteSet(Long setId) {
        Optional<ExerciseSet> existing = exerciseSetRepository.findById(setId);
        if (existing.isPresent() && existing.get().getSession() != null && existing.get().getSession().isFinished()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Session is finished");
        }
        if (existing.isPresent() && existing.get().getSession() != null) touch(existing.get().getSession());
        exerciseSetRepository.deleteById(setId);
    }

    // Any set change counts as activity on its session (see Session.lastActivityAt).
    private void touch(Session session) {
        session.setLastActivityAt(Instant.now());
        sessionRepository.save(session);
    }
}
