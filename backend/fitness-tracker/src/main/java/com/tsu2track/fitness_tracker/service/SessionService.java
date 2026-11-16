package com.tsu2track.fitness_tracker.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;

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
    private final WeeklyGoals weeklyGoals;
    private final CalendarPlans calendarPlans;

    public SessionService(SessionRepository sessionRepository,
                          WorkoutRepository workoutRepository,
                          ExerciseRepository exerciseRepository,
                          ExerciseSetRepository exerciseSetRepository,
                          SessionExerciseRepository sessionExerciseRepository,
                          WorkoutExerciseRepository workoutExerciseRepository,
                          ScheduledWorkoutRepository scheduledWorkoutRepository,
                          ExerciseNotes exerciseNotes,
                          WeeklyGoals weeklyGoals,
                          CalendarPlans calendarPlans) {
        this.sessionRepository = sessionRepository;
        this.workoutRepository = workoutRepository;
        this.exerciseRepository = exerciseRepository;
        this.exerciseSetRepository = exerciseSetRepository;
        this.sessionExerciseRepository = sessionExerciseRepository;
        this.workoutExerciseRepository = workoutExerciseRepository;
        this.scheduledWorkoutRepository = scheduledWorkoutRepository;
        this.exerciseNotes = exerciseNotes;
        this.weeklyGoals = weeklyGoals;
        this.calendarPlans = calendarPlans;
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

    // When a workout was last finished ("last done Mon 10 Nov"); empty if never.
    public Optional<LocalDate> lastDone(Long workoutId) {
        return sessionRepository
            .findFirstByUserIdAndWorkout_IdAndFinishedTrueOrderByDateDescIdDesc(CurrentUser.id(), workoutId)
            .map(Session::getDate);
    }

    // Sets logged in a session, each side of a one-sided exercise counted
    // on its own (the summary's Sets total counts the same way).
    public long countSets(Session session) {
        return exerciseSetRepository.countBySession_Id(session.getId());
    }

    /* Weeks in a row (Monday start) that met that week's goal (finished
       sessions; WeeklyGoals, one with no goal), counting back from
       weekStart. The current week doesn't break the streak before it's met:
       then it starts from last week. */
    public int countWeekStreak(LocalDate weekStart) {
        // Finished sessions per week: [0] this week, [1] last week, ...
        Map<Long, Integer> perWeek = new HashMap<>();
        for (LocalDate date : sessionRepository.findFinishedSessionDatesUpTo(CurrentUser.id(), weekStart.plusDays(6))) {
            long weeksBack = Math.floorDiv(ChronoUnit.DAYS.between(date, weekStart) + 6, 7);
            perWeek.merge(weeksBack, 1, Integer::sum);
        }
        Function<LocalDate, Integer> goal = weeklyGoals.forWeeks();
        long back = 0;
        if (perWeek.getOrDefault(0L, 0) < goal.apply(weekStart)) back = 1;
        int streak = 0;
        while (perWeek.getOrDefault(back, 0) >= goal.apply(weekStart.minusWeeks(back))) {
            streak++;
            back++;
        }
        return streak;
    }

    /* Home's week strip and selected-day card, one per day Monday to
       Sunday. done: a finished session that day. planned: a plan still to
       do that day (saved or from a repeat rule; done and skipped ones don't
       count). Both can be true; the page shows done first.
       sessions: that day's finished workouts, in the order they were made,
       with their set count (each side on its own, like the summary) and
       length (null without a stopwatch time). plans: that day's plans still
       to do, saved ones first; scheduleId is null for a repeat rule's day.
       skipped: the plans marked skipped that day (like the calendar, the page
       also counts a past day's plans still to do as skipped). */
    public record DaySession(Long sessionId, Long workoutId, String workoutName, long sets, Long durationSeconds) {}
    public record DayPlan(Long scheduleId, Long workoutId, String workoutName) {}
    public record WeekDay(LocalDate date, boolean done, boolean planned,
                          List<DaySession> sessions, List<DayPlan> plans, List<DayPlan> skipped) {}

    public List<WeekDay> weekDays(LocalDate weekStart) {
        LocalDate weekEnd = weekStart.plusDays(6);
        Map<LocalDate, List<DaySession>> sessions = new HashMap<>();
        for (Session session : sessionRepository
                .findByUserIdAndFinishedTrueAndDateBetweenOrderByDateAscIdAsc(CurrentUser.id(), weekStart, weekEnd)) {
            sessions.computeIfAbsent(session.getDate(), d -> new ArrayList<>()).add(new DaySession(
                session.getId(), session.getWorkoutId(), session.getWorkout().getName(),
                countSets(session), session.getDurationSeconds()));
        }
        Map<LocalDate, List<DayPlan>> plans = new HashMap<>();
        Map<LocalDate, List<DayPlan>> skipped = new HashMap<>();
        for (ScheduledWorkout plan : calendarPlans.between(weekStart, weekEnd)) {
            Map<LocalDate, List<DayPlan>> into = plan.getStatus() == ScheduleStatus.PLANNED ? plans
                : plan.getStatus() == ScheduleStatus.SKIPPED ? skipped : null;
            if (into == null) continue;
            into.computeIfAbsent(plan.getDate(), d -> new ArrayList<>())
                .add(new DayPlan(plan.getId(), plan.getWorkoutId(), plan.getWorkout().getName()));
        }
        List<WeekDay> days = new ArrayList<>();
        for (LocalDate day = weekStart; !day.isAfter(weekEnd); day = day.plusDays(1)) {
            List<DaySession> done = sessions.getOrDefault(day, List.of());
            List<DayPlan> planned = plans.getOrDefault(day, List.of());
            days.add(new WeekDay(day, !done.isEmpty(), !planned.isEmpty(), done, planned,
                skipped.getOrDefault(day, List.of())));
        }
        return days;
    }

    // The earliest workout still planned for today or later, repeat rules
    // included (unsaved: no id).
    public Optional<ScheduledWorkout> findNextPlanned(LocalDate today) {
        return calendarPlans.next(today);
    }

    // Plans still to do on a day (the next one included).
    public long countPlannedOn(LocalDate date) {
        return calendarPlans.countPlannedOn(date);
    }

    public Session createSession(Long workoutId) {
        return createSession(workoutId, null);
    }

    // A start time the app sends further back than this (or in the future)
    // isn't believed: the stopwatch starts now instead.
    static final long MAX_START_AGE_HOURS = 24;

    /* startedAt: when Start was tapped on the phone, which is before this
       session exists (it's made on the first logged set). */
    public Session createSession(Long workoutId, Instant startedAt) {
        Optional<Workout> workout = workoutRepository.findByIdAndUserId(workoutId, CurrentUser.id());
        if (!workout.isPresent()) {
            return null;
        }
        Instant now = Instant.now();
        boolean believable = startedAt != null && !startedAt.isAfter(now)
            && startedAt.isAfter(now.minus(MAX_START_AGE_HOURS, ChronoUnit.HOURS));
        Session session = new Session();
        session.setDate(LocalDate.now());
        session.setLastActivityAt(now);
        session.setStartedAt(believable ? startedAt : now);
        session.setWorkout(workout.get());
        return sessionRepository.save(session);
    }

    public Session finishSession(Long sessionId, List<Long> orderedExerciseIds) {
        return finishSession(sessionId, orderedExerciseIds, null);
    }

    /* finishedAt: when the workout ended, if not now. Auto-end sends the
       last activity, so the hours it sat idle don't count. Kept between
       the start and now. */
    @Transactional
    public Session finishSession(Long sessionId, List<Long> orderedExerciseIds, Instant finishedAt) {
        Session session = ownedSession(sessionId);
        if (session.isFinished()) {
            return session;
        }
        Long workoutId = session.getWorkoutId();
        List<WorkoutExercise> currentJoins = workoutExerciseRepository.findLiveByWorkoutId(workoutId);

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
        return writeFinish(session, exercisesById, finishedAt);
    }

    /* Finish with exactly the exercises done today, in order: the live
       workout's list after exercises were added, replaced or removed. Ids
       that aren't usable (another account's, deleted, unknown) are skipped.
       updateWorkout: the workout's own list becomes this one, from now on;
       otherwise the workout is left as it was ("today only"). */
    @Transactional
    public Session finishWithExercises(Long sessionId, List<Long> exerciseIds, boolean updateWorkout, Instant finishedAt) {
        Session session = ownedSession(sessionId);
        if (session.isFinished()) {
            return session;
        }
        Map<Long, Exercise> exercisesById = usableInOrder(exerciseIds);
        // An empty list would leave the workout with nothing in it.
        if (updateWorkout && !exercisesById.isEmpty()) {
            setWorkoutExercises(session.getWorkout(), new ArrayList<>(exercisesById.values()));
        }
        return writeFinish(session, exercisesById, finishedAt);
    }

    /* "Update the workout from now on" when nothing was logged, so there's
       no session to finish: the workout's list becomes exactly these, in
       order, with the same rules as finishWithExercises. 400 if none of
       them is usable (the workout would be left empty). */
    @Transactional
    public void setWorkoutList(Long workoutId, List<Long> exerciseIds) {
        Workout workout = ownedWorkout(workoutId);
        Map<Long, Exercise> exercises = usableInOrder(exerciseIds == null ? List.of() : exerciseIds);
        if (exercises.isEmpty()) {
            throw new ApiFieldException(HttpStatus.BAD_REQUEST, "exerciseIds", "A workout needs at least one exercise");
        }
        setWorkoutExercises(workout, new ArrayList<>(exercises.values()));
    }

    // The ids' exercises in order, skipping repeats and any that aren't
    // usable (another account's, deleted, unknown).
    private Map<Long, Exercise> usableInOrder(List<Long> exerciseIds) {
        Map<Long, Exercise> exercisesById = new LinkedHashMap<>();
        for (Long id : exerciseIds) {
            if (id == null || exercisesById.containsKey(id)) continue;
            exerciseRepository.findUsable(id, CurrentUser.id())
                .filter(e -> !e.isDeleted())
                .ifPresent(e -> exercisesById.put(id, e));
        }
        return exercisesById;
    }

    /* Makes the workout's list exactly these, in order. Links that stay
       keep their row (only the position changes); the rest are removed. */
    private void setWorkoutExercises(Workout workout, List<Exercise> exercises) {
        Map<Long, WorkoutExercise> current = new HashMap<>();
        for (WorkoutExercise we : workoutExerciseRepository.findLiveByWorkoutId(workout.getId())) {
            current.put(we.getExercise().getId(), we);
        }
        Set<Long> keep = new HashSet<>();
        for (Exercise ex : exercises) keep.add(ex.getId());
        for (Map.Entry<Long, WorkoutExercise> e : current.entrySet()) {
            if (!keep.contains(e.getKey())) workoutExerciseRepository.delete(e.getValue());
        }
        workoutExerciseRepository.flush();
        for (int i = 0; i < exercises.size(); i++) {
            Exercise ex = exercises.get(i);
            WorkoutExercise link = current.get(ex.getId());
            if (link != null) link.setPosition(i);
            else workoutExerciseRepository.save(new WorkoutExercise(workout, ex, i));
        }
    }

    // The end of both finishes: the end time, the history snapshot (the
    // given exercises, then any other with a set logged today), finished.
    private Session writeFinish(Session session, Map<Long, Exercise> exercisesById, Instant finishedAt) {
        Instant now = Instant.now();
        Instant end = finishedAt == null || finishedAt.isAfter(now) ? now : finishedAt;
        if (session.getStartedAt() != null && end.isBefore(session.getStartedAt())) end = session.getStartedAt();
        session.setFinishedAt(end);

        List<ExerciseSet> sessionSets = exerciseSetRepository.findBySession_Id(session.getId());
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
            sessionExerciseRepository.save(snapshotOf(session, ex, position++));
        }

        session.setFinished(true);
        Session saved = sessionRepository.save(session);
        applyPendingLogTypes();
        return saved;
    }

    // The exercise as it is now, as this session's record of it (its history snapshot).
    private static SessionExercise snapshotOf(Session session, Exercise ex, int position) {
        SessionExercise snapshot = new SessionExercise();
        snapshot.setSession(session);
        snapshot.setExercise(ex);
        snapshot.setPosition(position);
        snapshot.setName(ex.getName());
        snapshot.setCategory(ex.getCategory());
        snapshot.setPrimaryMuscleGroups(ex.getPrimaryMuscleGroups());
        snapshot.setExerciseType(ex.getExerciseType());
        snapshot.setCues(ex.getCues());
        snapshot.setUnilateral(ex.getUnilateral());
        snapshot.setLogType(ex.getLogType());
        return snapshot;
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

    // What resetting an exercise would delete: its sets in the account's
    // finished sessions, and how many sessions they're in.
    public record HistoryCount(int sets, int sessions) {}

    public HistoryCount countExerciseHistory(Long exerciseId) {
        List<ExerciseSet> sets = finishedSetsOf(exerciseId);
        return new HistoryCount(sets.size(), sessionIdsOf(sets).size());
    }

    /* Reset an exercise: every set of it in the account's finished sessions
       goes, in every workout, and it leaves those sessions' summaries. A
       session left with no sets at all goes too, its calendar day back to
       planned. A workout in progress is left alone, and the exercise stays
       in the library and in its workouts. A built-in's other accounts keep
       theirs.
       keepSessionId: the finished workout being edited (editing history)
       loses the exercise's sets but keeps the exercise and itself, even
       with no sets left (its page tidies it up on leaving if still empty:
       removeIfEmpty). */
    public HistoryCount resetExerciseHistory(Long exerciseId) {
        return resetExerciseHistory(exerciseId, null);
    }

    @Transactional
    public HistoryCount resetExerciseHistory(Long exerciseId, Long keepSessionId) {
        List<ExerciseSet> sets = finishedSetsOf(exerciseId);
        List<Long> sessionIds = sessionIdsOf(sets);
        if (sessionIds.isEmpty()) return new HistoryCount(0, 0);
        exerciseSetRepository.deleteByExerciseInSessions(exerciseId, sessionIds);
        List<Long> leaving = sessionIds.stream().filter(id -> !id.equals(keepSessionId)).toList();
        if (leaving.isEmpty()) return new HistoryCount(sets.size(), sessionIds.size());
        sessionExerciseRepository.deleteByExerciseInSessions(exerciseId, leaving);
        for (Long sessionId : leaving) {
            if (exerciseSetRepository.existsBySession_Id(sessionId)) continue;
            removeEmptiedSession(sessionId);
        }
        return new HistoryCount(sets.size(), sessionIds.size());
    }

    private List<ExerciseSet> finishedSetsOf(Long exerciseId) {
        Long userId = CurrentUser.id();
        exerciseRepository.findUsable(exerciseId, userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found"));
        return exerciseSetRepository.findFinishedSetsOldestFirst(exerciseId, userId);
    }

    // What resetting a workout would delete: its finished sessions and their sets.
    public HistoryCount countWorkoutHistory(Long workoutId) {
        int sessions = finishedSessionsOf(workoutId).size();
        return new HistoryCount((int) exerciseSetRepository.countFinishedInWorkout(workoutId), sessions);
    }

    /* Reset a workout: every finished session of it goes (its sets and
       summary with it), each calendar day undone like an emptied session's
       (removeEmptiedSession). The workout, its exercises and its repeat
       stay, and a session of it in progress is left alone. */
    @Transactional
    public HistoryCount resetWorkoutHistory(Long workoutId) {
        List<Long> sessionIds = finishedSessionsOf(workoutId).stream().map(Session::getId).toList();
        if (sessionIds.isEmpty()) return new HistoryCount(0, 0);
        int sets = (int) exerciseSetRepository.countFinishedInWorkout(workoutId);
        // In bulk first: a session's sets list needn't hold every set of it
        // (sets are saved on their own), so cascading alone could miss some.
        exerciseSetRepository.deleteInSessions(sessionIds);
        sessionExerciseRepository.deleteInSessions(sessionIds);
        for (Long sessionId : sessionIds) removeEmptiedSession(sessionId);
        return new HistoryCount(sets, sessionIds.size());
    }

    private List<Session> finishedSessionsOf(Long workoutId) {
        ownedWorkout(workoutId);
        return sessionRepository.findByWorkout_IdAndFinishedTrue(workoutId);
    }

    private static List<Long> sessionIdsOf(List<ExerciseSet> sets) {
        return sets.stream().map(ExerciseSet::getSessionId).distinct().toList();
    }

    /* A finished session with nothing left in it: gone, and its calendar
       entry undone. A repeating plan's day goes back to planned. Any other
       entry goes: finishing a workout that wasn't planned makes a Done entry
       too (syncCalendarOnFinish), and nothing tells the two apart, so a day
       planned by hand is left unplanned rather than unplanned days showing
       up as plans. */
    private void removeEmptiedSession(Long sessionId) {
        scheduledWorkoutRepository.findBySession_Id(sessionId).ifPresent(sw -> {
            if (sw.getRepeatDate() != null) {
                sw.setSession(null);
                sw.setStatus(ScheduleStatus.PLANNED);
                scheduledWorkoutRepository.save(sw);
            } else {
                scheduledWorkoutRepository.delete(sw);
            }
        });
        sessionRepository.findById(sessionId).ifPresent(sessionRepository::delete);
    }

    /* Leaving a finished workout's editing page (or the next app start, if
       the app closed on it): a session left with no sets goes, as Reset
       tidies the others (calendar day back to planned). True if it went;
       409 for a workout in progress. */
    @Transactional
    public boolean removeIfEmpty(Long sessionId) {
        finishedSession(sessionId);
        if (exerciseSetRepository.existsBySession_Id(sessionId)) return false;
        removeEmptiedSession(sessionId);
        return true;
    }

    // One of the account's sessions (its summary shows how long it took).
    public Session findSession(Long sessionId) {
        return ownedSession(sessionId);
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

    /* Editing history: a finished workout's exercises (its finish snapshot)
       can be added, removed and replaced. That day only: the workout's own
       list stays as it is. A live workout keeps its list on the device until
       Finish, so these are 409 for it. Each answers the session's exercises
       as they now are. */

    // At the end, in order, as they are now (type, sidedness, name...).
    // 409 if one is already in the workout; 404 for one that isn't usable.
    @Transactional
    public List<SessionExercise> addSessionExercises(Long sessionId, List<Long> exerciseIds) {
        Session session = finishedSession(sessionId);
        if (exerciseIds == null || exerciseIds.isEmpty()) {
            throw new ApiFieldException(HttpStatus.BAD_REQUEST, "exerciseIds", "Pick at least one exercise");
        }
        List<SessionExercise> current = sessionExerciseRepository.findBySession_IdOrderByPositionAsc(sessionId);
        Set<Long> present = new HashSet<>();
        for (SessionExercise entry : current) present.add(entry.getExercise().getId());
        Map<Long, Exercise> adding = new LinkedHashMap<>();
        for (Long id : exerciseIds) {
            if (id == null || adding.containsKey(id)) continue;
            Exercise ex = usableExercise(id);
            if (present.contains(id)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, ex.getName() + " is already in this workout");
            }
            adding.put(id, ex);
        }
        int position = current.isEmpty() ? 0 : current.get(current.size() - 1).getPosition() + 1;
        for (Exercise ex : adding.values()) {
            sessionExerciseRepository.save(snapshotOf(session, ex, position++));
        }
        return findSessionExercises(sessionId);
    }

    // Its sets go with it. 409 for the last one (delete the workout instead).
    @Transactional
    public List<SessionExercise> removeSessionExercise(Long sessionId, Long exerciseId) {
        finishedSession(sessionId);
        List<SessionExercise> current = sessionExerciseRepository.findBySession_IdOrderByPositionAsc(sessionId);
        inSnapshot(current, exerciseId);
        if (current.size() == 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A workout needs at least one exercise");
        }
        deleteFromSession(sessionId, exerciseId);
        // Close the gap in the order.
        List<SessionExercise> left = sessionExerciseRepository.findBySession_IdOrderByPositionAsc(sessionId);
        for (int i = 0; i < left.size(); i++) left.get(i).setPosition(i);
        return findSessionExercises(sessionId);
    }

    // The replacement takes its place in the order; its sets go. 409 if the
    // replacement is already in the workout.
    @Transactional
    public List<SessionExercise> replaceSessionExercise(Long sessionId, Long exerciseId, Long replacementId) {
        finishedSession(sessionId);
        List<SessionExercise> current = sessionExerciseRepository.findBySession_IdOrderByPositionAsc(sessionId);
        int position = inSnapshot(current, exerciseId).getPosition();
        Exercise replacement = usableExercise(replacementId);
        for (SessionExercise entry : current) {
            if (entry.getExercise().getId().equals(replacementId)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, replacement.getName() + " is already in this workout");
            }
        }
        deleteFromSession(sessionId, exerciseId);
        // The bulk deletes clear what was loaded: fetch again to save.
        sessionExerciseRepository.save(snapshotOf(ownedSession(sessionId), usableExercise(replacementId), position));
        return findSessionExercises(sessionId);
    }

    // An exercise's sets and record in one session (bulk deletes: the
    // session's own sets list needn't hold every set).
    private void deleteFromSession(Long sessionId, Long exerciseId) {
        exerciseSetRepository.deleteByExerciseInSessions(exerciseId, List.of(sessionId));
        sessionExerciseRepository.deleteByExerciseInSessions(exerciseId, List.of(sessionId));
    }

    private Session finishedSession(Long sessionId) {
        Session session = ownedSession(sessionId);
        if (!session.isFinished()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This workout is still in progress");
        }
        return session;
    }

    private static SessionExercise inSnapshot(List<SessionExercise> entries, Long exerciseId) {
        for (SessionExercise entry : entries) {
            if (entry.getExercise().getId().equals(exerciseId)) return entry;
        }
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise isn't in this workout");
    }

    private Exercise usableExercise(Long exerciseId) {
        return exerciseRepository.findUsable(exerciseId, CurrentUser.id())
            .filter(e -> !e.isDeleted())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found"));
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

    /* The sets of the last time the exercise was done in any workout, and
       where: for an exercise with no history in the workout being done
       (added, or swapped in), so the live workout still has "last time"
       hints and can say they come from elsewhere. Empty if never done (or
       never as its current type). beforeSessionId: as in findLastSets. */
    @Transactional(readOnly = true)
    public Optional<LastDone> findLastDone(Long exerciseId, Long beforeSessionId) {
        Optional<Exercise> exercise = exerciseRepository.findUsable(exerciseId, CurrentUser.id());
        if (exercise.isEmpty()) return Optional.empty();
        LocalDate beforeDate = null;
        if (beforeSessionId != null) {
            Optional<Session> anchor = sessionRepository.findByIdAndUserId(beforeSessionId, CurrentUser.id());
            if (anchor.isEmpty()) return Optional.empty();
            beforeDate = anchor.get().getDate();
        }
        List<ExerciseSet> sets = exerciseSetRepository.findLastSetsInAnyWorkout(
            CurrentUser.id(), exerciseId, exercise.get().getLogType(), beforeSessionId, beforeDate);
        if (sets.isEmpty()) return Optional.empty();
        Session session = sets.get(0).getSession();
        Workout workout = session.getWorkout();
        return Optional.of(new LastDone(session.getId(), session.getDate(),
            workout != null ? workout.getId() : null, workout != null ? workout.getName() : null, sets));
    }

    public record LastDone(Long sessionId, LocalDate date, Long workoutId, String workoutName, List<ExerciseSet> sets) {}

    public ExerciseSet createSet(Long sessionId, Long exerciseId, CreateSetRequest req) {
        Optional<Session> session = sessionRepository.findByIdAndUserId(sessionId, CurrentUser.id());
        Optional<Exercise> exercise = exerciseRepository.findUsable(exerciseId, CurrentUser.id());
        if (session.isPresent() && exercise.isPresent()) {
            /* A finished workout can be edited (editing history), but only
               its own exercises, as they were logged: the finish snapshot's
               type and sidedness, not the exercise's current ones. A whole
               exercise is added first (addSessionExercises). */
            LogType logType = exercise.get().getLogType();
            Boolean unilateral = exercise.get().getUnilateral();
            if (session.get().isFinished()) {
                SessionExercise snapshot = sessionExerciseRepository
                    .findFirstBySession_IdAndExercise_Id(sessionId, exerciseId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Exercise isn't in this workout"));
                logType = snapshot.getLogType();
                unilateral = snapshot.getUnilateral();
            }
            boolean isUnilateral = Boolean.TRUE.equals(unilateral);
            if (isUnilateral && req.side() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Side is required for unilateral exercises");
            }
            if (!isUnilateral && req.side() != null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Side must not be set for bilateral exercises");
            }
            ExerciseSet set = new ExerciseSet();
            set.setLogType(logType);
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
            setNumbers(set, req.weight(), req.reps(), req.durationSeconds(), req.distanceKm());
            if (set.getSession() != null) touch(set.getSession());
            return exerciseSetRepository.save(set);
        }
        return null;
    }

    public void deleteSet(Long setId) {
        Optional<ExerciseSet> existing = exerciseSetRepository.findByIdAndSession_UserId(setId, CurrentUser.id());
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
    // A finished workout edited later (editing history) isn't active again.
    private void touch(Session session) {
        if (session.isFinished()) return;
        session.setLastActivityAt(Instant.now());
        sessionRepository.save(session);
    }
}
