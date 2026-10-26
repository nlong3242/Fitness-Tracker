package com.tsu2track.fitness_tracker.service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
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

import com.tsu2track.fitness_tracker.ApiFieldException;
import com.tsu2track.fitness_tracker.Exercise;
import com.tsu2track.fitness_tracker.ExerciseRepository;
import com.tsu2track.fitness_tracker.ExerciseSet;
import com.tsu2track.fitness_tracker.ExerciseSetRepository;
import com.tsu2track.fitness_tracker.LogType;
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
import com.tsu2track.fitness_tracker.security.CurrentUser;

@Service
public class SessionService {
    private final SessionRepository sessionRepository;
    private final WorkoutRepository workoutRepository;
    private final ExerciseRepository exerciseRepository;
    private final ExerciseSetRepository exerciseSetRepository;
    private final SessionExerciseRepository sessionExerciseRepository;
    private final WorkoutExerciseRepository workoutExerciseRepository;
    private final ScheduledWorkoutRepository scheduledWorkoutRepository;
    private final ExerciseNotes exerciseNotes;

    public SessionService(SessionRepository sessionRepository,
                          WorkoutRepository workoutRepository,
                          ExerciseRepository exerciseRepository,
                          ExerciseSetRepository exerciseSetRepository,
                          SessionExerciseRepository sessionExerciseRepository,
                          WorkoutExerciseRepository workoutExerciseRepository,
                          ScheduledWorkoutRepository scheduledWorkoutRepository,
                          ExerciseNotes exerciseNotes) {
        this.sessionRepository = sessionRepository;
        this.workoutRepository = workoutRepository;
        this.exerciseRepository = exerciseRepository;
        this.exerciseSetRepository = exerciseSetRepository;
        this.sessionExerciseRepository = sessionExerciseRepository;
        this.workoutExerciseRepository = workoutExerciseRepository;
        this.scheduledWorkoutRepository = scheduledWorkoutRepository;
        this.exerciseNotes = exerciseNotes;
    }

    public Page<Session> findSessions(Long workoutId, Pageable pageable) {
        ownedWorkout(workoutId);
        return sessionRepository.findByWorkout_IdOrderByDateDescIdDesc(workoutId, pageable);
    }

    /* The workout the user is still in the middle of (started, never
       finished), so the app can offer to resume it. Most recent wins. */
    public Optional<Session> findUnfinishedSession() {
        return sessionRepository.findFirstByUserIdAndFinishedFalseOrderByDateDescIdDesc(CurrentUser.id());
    }

    // Home page stats. weekStart comes from the client so "this week" follows
    // the user's local calendar (Monday start, like the calendar view).
    public long countFinishedInWeek(LocalDate weekStart) {
        return sessionRepository.countByUserIdAndFinishedTrueAndDateBetween(
            CurrentUser.id(), weekStart, weekStart.plusDays(6));
    }

    public Optional<Session> findLastFinishedSession() {
        return sessionRepository.findFirstByUserIdAndFinishedTrueOrderByDateDescIdDesc(CurrentUser.id());
    }

    /* Weeks in a row (Monday start) with at least one finished session,
       counting back from weekStart. A week with nothing yet doesn't break
       the streak while it's still the current one: it starts from last week. */
    public int countWeekStreak(LocalDate weekStart) {
        // Newest first, so each week's dates come in one run.
        List<LocalDate> dates = sessionRepository.findFinishedDatesUpTo(CurrentUser.id(), weekStart.plusDays(6));
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
        return scheduledWorkoutRepository.findFirstByUserIdAndStatusAndDateGreaterThanEqualOrderByDateAscCreatedAtAsc(
            CurrentUser.id(), ScheduleStatus.PLANNED, today);
    }

    // Plans still to do on a day (the next one included).
    public long countPlannedOn(LocalDate date) {
        return scheduledWorkoutRepository.countByUserIdAndStatusAndDate(CurrentUser.id(), ScheduleStatus.PLANNED, date);
    }

    public Session createSession(Long workoutId) {
        Optional<Workout> workout = workoutRepository.findByIdAndUserId(workoutId, CurrentUser.id());
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
        Session session = ownedSession(sessionId);
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
            snapshot.setLogType(ex.getLogType());
            sessionExerciseRepository.save(snapshot);
        }

        session.setFinished(true);
        Session saved = sessionRepository.save(session);
        applyPendingLogTypes();
        return saved;
    }

    // Type changes made during a workout (Exercise.pendingLogType) take
    // effect once no workout being done still has the exercise. A built-in's
    // (BuiltInExercises) waits for every account's workouts.
    private void applyPendingLogTypes() {
        Long userId = CurrentUser.id();
        applyPendingLogTypes(exerciseRepository.findByUserIdAndPendingLogTypeIsNotNull(userId), userId);
        applyPendingLogTypes(exerciseRepository.findByBuiltInTrueAndPendingLogTypeIsNotNull(), null);
    }

    private void applyPendingLogTypes(List<Exercise> waiting, Long userId) {
        for (Exercise ex : waiting) {
            if (sessionRepository.existsOpenSessionWith(userId, ex.getId())) continue;
            ex.setLogType(ex.getPendingLogType());
            ex.setPendingLogType(null);
            exerciseRepository.save(ex);
        }
    }

    @Transactional
    public void deleteSession(Long sessionId) {
        Session session = ownedSession(sessionId);
        // scheduled_workout.session_id has a plain FK to session; deleting a
        // linked session without unlinking first is a constraint violation.
        // The calendar entry itself (and its status) is left untouched.
        scheduledWorkoutRepository.findBySession_Id(sessionId).ifPresent(sw -> {
            sw.setSession(null);
            scheduledWorkoutRepository.save(sw);
        });
        sessionRepository.delete(session);
        applyPendingLogTypes();
    }

    public List<SessionExercise> findSessionExercises(Long sessionId) {
        ownedSession(sessionId);
        List<SessionExercise> entries = sessionExerciseRepository.findBySession_IdOrderByPositionAsc(sessionId);
        // Notes on built-in exercises are per account.
        List<Exercise> exercises = new ArrayList<>();
        for (SessionExercise entry : entries) {
            if (entry.getExercise() != null) exercises.add(entry.getExercise());
        }
        exerciseNotes.show(CurrentUser.id(), exercises);
        return entries;
    }

    public Optional<SessionController.SessionTotals> findPreviousTotals(Long workoutId, Long sessionId) {
        ownedWorkout(workoutId);
        Session current = ownedSession(sessionId);
        Optional<Session> previous = sessionRepository.findPreviousSession(workoutId, current.getDate(), sessionId);
        if (!previous.isPresent()) {
            return Optional.empty();
        }

        List<ExerciseSet> sets = exerciseSetRepository.findBySession_Id(previous.get().getId());
        java.util.Set<Long> uniqueExercises = new HashSet<>();
        int repsTotal = 0;
        double volumeTotal = 0;
        int durationTotal = 0;
        double distanceTotal = 0;
        // Numbers a set's type doesn't use are 0 or null, so they add nothing.
        for (ExerciseSet set : sets) {
            uniqueExercises.add(set.getExerciseId());
            repsTotal += set.getReps();
            volumeTotal += set.getWeight() * set.getReps();
            if (set.getDurationSeconds() != null) durationTotal += set.getDurationSeconds();
            if (set.getDistanceKm() != null) distanceTotal += set.getDistanceKm();
        }

        SessionController.SessionTotals totals = new SessionController.SessionTotals();
        totals.setExercises(uniqueExercises.size());
        totals.setSets(sets.size());
        totals.setReps(repsTotal);
        totals.setVolume(volumeTotal);
        totals.setDurationSeconds(durationTotal);
        totals.setDistanceKm(distanceTotal);
        return Optional.of(totals);
    }

    public List<ExerciseSet> findSetsBySession(Long sessionId) {
        ownedSession(sessionId);
        return exerciseSetRepository.findBySession_Id(sessionId);
    }

    public List<ExerciseSet> findLastSets(Long workoutId, Long exerciseId, Long beforeSessionId) {
        if (workoutRepository.findByIdAndUserId(workoutId, CurrentUser.id()).isEmpty()) {
            return Collections.emptyList();
        }
        Optional<Exercise> exercise = exerciseRepository.findUsable(exerciseId, CurrentUser.id());
        if (exercise.isEmpty()) {
            return Collections.emptyList();
        }
        LocalDate beforeDate = null;
        if (beforeSessionId != null) {
            Optional<Session> anchor = sessionRepository.findByIdAndUserId(beforeSessionId, CurrentUser.id());
            if (!anchor.isPresent()) {
                return Collections.emptyList();
            }
            beforeDate = anchor.get().getDate();
        }
        return exerciseSetRepository.findLastSetsForExercise(
            workoutId, exerciseId, exercise.get().getLogType(), beforeSessionId, beforeDate);
    }

    public ExerciseSet createSet(Long sessionId, Long exerciseId, CreateSetRequest req) {
        Optional<Session> session = sessionRepository.findByIdAndUserId(sessionId, CurrentUser.id());
        Optional<Exercise> exercise = exerciseRepository.findUsable(exerciseId, CurrentUser.id());
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
            set.setLogType(exercise.get().getLogType());
            setNumbers(set, req.weight(), req.reps(), req.durationSeconds(), req.distanceKm());
            set.setSide(req.side());
            set.setExercise(exercise.get());
            set.setSession(session.get());
            touch(session.get());
            return exerciseSetRepository.save(set);
        }
        return null;
    }

    public ExerciseSet updateSet(Long setId, UpdateSetRequest req) {
        Optional<ExerciseSet> existing = exerciseSetRepository.findByIdAndSession_UserId(setId, CurrentUser.id());
        if (existing.isPresent()) {
            ExerciseSet set = existing.get();
            if (set.getSession() != null && set.getSession().isFinished()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Session is finished");
            }
            setNumbers(set, req.weight(), req.reps(), req.durationSeconds(), req.distanceKm());
            if (set.getSession() != null) touch(set.getSession());
            return exerciseSetRepository.save(set);
        }
        return null;
    }

    public void deleteSet(Long setId) {
        Optional<ExerciseSet> existing = exerciseSetRepository.findByIdAndSession_UserId(setId, CurrentUser.id());
        if (existing.isPresent() && existing.get().getSession() != null && existing.get().getSession().isFinished()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Session is finished");
        }
        if (existing.isEmpty()) return;
        if (existing.get().getSession() != null) touch(existing.get().getSession());
        exerciseSetRepository.delete(existing.get());
    }

    /* Puts the numbers on a set, checked against its logType: each type
       needs its own numbers (distance is optional) and takes no others.
       Unused weight and reps are stored as 0. */
    private static void setNumbers(ExerciseSet set, Double weight, Integer reps,
                                   Integer durationSeconds, Double distanceKm) {
        LogType type = set.getLogType();
        boolean weighted = type == LogType.WEIGHT_REPS;
        boolean counted = weighted || type == LogType.REPS;
        boolean timed = type == LogType.TIME || type == LogType.DISTANCE_TIME;
        boolean distanced = type == LogType.DISTANCE_TIME;
        checkNumber("weight", weight, weighted, true, type);
        checkNumber("reps", reps, counted, true, type);
        checkNumber("durationSeconds", durationSeconds, timed, true, type);
        checkNumber("distanceKm", distanceKm, distanced, false, type);
        set.setWeight(weighted ? weight : 0);
        set.setReps(counted ? reps : 0);
        set.setDurationSeconds(durationSeconds);
        set.setDistanceKm(distanceKm);
    }

    private static void checkNumber(String field, Object value, boolean used, boolean required, LogType type) {
        if (used && required && value == null) {
            throw new ApiFieldException(HttpStatus.BAD_REQUEST, field, "is required for " + type);
        }
        if (!used && value != null) {
            throw new ApiFieldException(HttpStatus.BAD_REQUEST, field, "must be empty for " + type);
        }
    }

    // Another account's workout or session is "not found", same as a missing one.
    private Workout ownedWorkout(Long workoutId) {
        return workoutRepository.findByIdAndUserId(workoutId, CurrentUser.id())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Workout not found"));
    }

    private Session ownedSession(Long sessionId) {
        return sessionRepository.findByIdAndUserId(sessionId, CurrentUser.id())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found"));
    }

    // Any set change counts as activity on its session (see Session.lastActivityAt).
    private void touch(Session session) {
        session.setLastActivityAt(Instant.now());
        sessionRepository.save(session);
    }
}
