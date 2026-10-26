package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.context.annotation.Import;

import com.tsu2track.fitness_tracker.dto.CreateExerciseRequest;
import com.tsu2track.fitness_tracker.dto.CreateSetRequest;
import com.tsu2track.fitness_tracker.dto.UpdateExerciseRequest;
import com.tsu2track.fitness_tracker.dto.UpdateSetRequest;
import com.tsu2track.fitness_tracker.service.ExerciseHistoryService;
import com.tsu2track.fitness_tracker.service.ExerciseHistoryService.History;
import com.tsu2track.fitness_tracker.service.ExerciseHistoryService.HistorySession;
import com.tsu2track.fitness_tracker.service.ExerciseHistoryService.HistorySet;
import com.tsu2track.fitness_tracker.service.ExerciseNotes;
import com.tsu2track.fitness_tracker.service.ExerciseService;
import com.tsu2track.fitness_tracker.service.HiddenExercises;
import com.tsu2track.fitness_tracker.service.SessionService;
import com.tsu2track.fitness_tracker.service.WeeklyGoals;

/* Exercises that aren't weight × reps (LogType): which numbers a set
   takes, Cardio, a type change waiting for the workout being done, and
   "last time" and records starting fresh after a change. */
@DataJpaTest
@ExtendWith(LoggedIn.class)
@Import({ SessionService.class, ExerciseService.class, ExerciseHistoryService.class,
          ExerciseNotes.class, HiddenExercises.class, WeeklyGoals.class })
class LogTypeTest {

    @Autowired TestEntityManager em;
    @Autowired SessionService sessions;
    @Autowired ExerciseService exercises;
    @Autowired ExerciseHistoryService history;
    @Autowired SessionExerciseRepository sessionExercises;

    private Workout workout;

    @BeforeEach
    void setUp() {
        workout = em.persist(new Workout("Core"));
    }

    // --- the numbers a set takes ---

    @Test
    void missingRepsAreReported() {
        Exercise bench = inWorkout(exercise("Bench Press", ExerciseCategory.CHEST, null));
        Session s = sessions.createSession(workout.getId());

        assertThatThrownBy(() -> sessions.createSet(s.getId(), bench.getId(), new CreateSetRequest(20.0, null, null, null, null)))
            .isInstanceOfSatisfying(ApiFieldException.class, e -> assertThat(e.getField()).isEqualTo("reps"));
    }

    @Test
    void aTimeSetTakesATimeAndNothingElse() {
        Exercise plank = inWorkout(exercise("Plank", ExerciseCategory.CORE, LogType.TIME));
        Session s = sessions.createSession(workout.getId());

        ExerciseSet set = sessions.createSet(s.getId(), plank.getId(), new CreateSetRequest(null, null, 90, null, null));

        assertThat(set.getLogType()).isEqualTo(LogType.TIME);
        assertThat(set).extracting(ExerciseSet::getDurationSeconds, ExerciseSet::getWeight, ExerciseSet::getReps)
            .containsExactly(90, 0.0, 0);
        assertThatThrownBy(() -> sessions.createSet(s.getId(), plank.getId(), new CreateSetRequest(null, 10, 90, null, null)))
            .isInstanceOfSatisfying(ApiFieldException.class, e -> assertThat(e.getField()).isEqualTo("reps"));
        assertThatThrownBy(() -> sessions.createSet(s.getId(), plank.getId(), new CreateSetRequest(null, null, null, null, null)))
            .isInstanceOfSatisfying(ApiFieldException.class, e -> assertThat(e.getField()).isEqualTo("durationSeconds"));
        assertThatThrownBy(() -> sessions.updateSet(set.getId(), new UpdateSetRequest(null, null, 60, 1.0)))
            .isInstanceOfSatisfying(ApiFieldException.class, e -> assertThat(e.getField()).isEqualTo("distanceKm"));
    }

    @Test
    void aRepsSetTakesNoWeight() {
        Exercise pushUp = inWorkout(exercise("Push-up", ExerciseCategory.CHEST, LogType.REPS));
        Session s = sessions.createSession(workout.getId());

        assertThat(sessions.createSet(s.getId(), pushUp.getId(), new CreateSetRequest(null, 15, null, null, null)).getReps())
            .isEqualTo(15);
        assertThatThrownBy(() -> sessions.createSet(s.getId(), pushUp.getId(), new CreateSetRequest(0.0, 15, null, null, null)))
            .isInstanceOfSatisfying(ApiFieldException.class, e -> assertThat(e.getField()).isEqualTo("weight"));
    }

    @Test
    void distanceIsOptionalButTimeIsNot() {
        Exercise rope = inWorkout(exercise("Rope Jumping", ExerciseCategory.CARDIO, null));
        Session s = sessions.createSession(workout.getId());

        assertThat(sessions.createSet(s.getId(), rope.getId(), new CreateSetRequest(null, null, 600, null, null)).getDistanceKm())
            .isNull();
        assertThat(sessions.createSet(s.getId(), rope.getId(), new CreateSetRequest(null, null, 1725, 5.2, null)).getDistanceKm())
            .isEqualTo(5.2);
        assertThatThrownBy(() -> sessions.createSet(s.getId(), rope.getId(), new CreateSetRequest(null, null, null, 5.2, null)))
            .isInstanceOfSatisfying(ApiFieldException.class, e -> assertThat(e.getField()).isEqualTo("durationSeconds"));
    }

    // --- choosing the type ---

    @Test
    void weightAndRepsUnlessSaidOtherwise() {
        assertThat(exercise("Bench Press", ExerciseCategory.CHEST, null).getLogType()).isEqualTo(LogType.WEIGHT_REPS);
        assertThat(exercise("Plank", ExerciseCategory.CORE, LogType.TIME).getLogType()).isEqualTo(LogType.TIME);
    }

    @Test
    void cardioIsAlwaysDistanceAndTime() {
        Exercise run = exercise("Treadmill Run", ExerciseCategory.CARDIO, LogType.REPS);
        assertThat(run.getLogType()).isEqualTo(LogType.DISTANCE_TIME);

        Exercise sled = exercise("Sled Push", ExerciseCategory.OTHER, LogType.WEIGHT_REPS);
        update(sled, ExerciseCategory.CARDIO, null);
        assertThat(sled.getLogType()).isEqualTo(LogType.DISTANCE_TIME);
    }

    @Test
    void leavingTheTypeOutKeepsIt() {
        Exercise plank = exercise("Plank", ExerciseCategory.CORE, LogType.TIME);

        update(plank, ExerciseCategory.CORE, null);

        assertThat(plank.getLogType()).isEqualTo(LogType.TIME);
    }

    // --- changing the type ---

    @Test
    void withNoWorkoutGoingTheChangeIsImmediate() {
        Exercise plank = inWorkout(exercise("Plank", ExerciseCategory.CORE, LogType.REPS));

        update(plank, ExerciseCategory.CORE, LogType.TIME);

        assertThat(plank.getLogType()).isEqualTo(LogType.TIME);
        assertThat(plank.getPendingLogType()).isNull();
    }

    @Test
    void duringAWorkoutTheChangeWaitsUntilItsFinished() {
        Exercise plank = inWorkout(exercise("Plank", ExerciseCategory.CORE, LogType.REPS));
        Session s = sessions.createSession(workout.getId());

        update(plank, ExerciseCategory.CORE, LogType.TIME);

        assertThat(plank.getLogType()).isEqualTo(LogType.REPS);
        assertThat(plank.getPendingLogType()).isEqualTo(LogType.TIME);
        // The workout being done still logs it as reps.
        assertThat(sessions.createSet(s.getId(), plank.getId(), new CreateSetRequest(null, 20, null, null, null)).getLogType())
            .isEqualTo(LogType.REPS);

        sessions.finishSession(s.getId(), null);

        assertThat(plank.getLogType()).isEqualTo(LogType.TIME);
        assertThat(plank.getPendingLogType()).isNull();
        assertThat(sessionExercises.findBySession_IdOrderByPositionAsc(s.getId()))
            .extracting(SessionExercise::getLogType).containsExactly(LogType.REPS);
    }

    @Test
    void discardingTheWorkoutAlsoApplies() {
        Exercise plank = inWorkout(exercise("Plank", ExerciseCategory.CORE, LogType.REPS));
        Session s = sessions.createSession(workout.getId());
        update(plank, ExerciseCategory.CORE, LogType.TIME);

        sessions.deleteSession(s.getId());

        assertThat(plank.getLogType()).isEqualTo(LogType.TIME);
        assertThat(plank.getPendingLogType()).isNull();
    }

    @Test
    void changingBackDuringTheWorkoutCancelsIt() {
        Exercise plank = inWorkout(exercise("Plank", ExerciseCategory.CORE, LogType.REPS));
        Session s = sessions.createSession(workout.getId());
        update(plank, ExerciseCategory.CORE, LogType.TIME);

        update(plank, ExerciseCategory.CORE, LogType.REPS);
        sessions.finishSession(s.getId(), null);

        assertThat(plank.getLogType()).isEqualTo(LogType.REPS);
        assertThat(plank.getPendingLogType()).isNull();
    }

    @Test
    void anExerciseNotInTheWorkoutBeingDoneChangesAtOnce() {
        sessions.createSession(workout.getId());
        Exercise wallSit = exercise("Wall Sit", ExerciseCategory.LEGS, LogType.REPS);

        update(wallSit, ExerciseCategory.LEGS, LogType.TIME);

        assertThat(wallSit.getLogType()).isEqualTo(LogType.TIME);
    }

    @Test
    void lastTimeAndRecordsStartFreshAfterAChange() {
        Exercise plank = inWorkout(exercise("Plank", ExerciseCategory.CORE, LogType.REPS));
        Session reps = finishedSession(plank, new CreateSetRequest(null, 20, null, null, null));
        update(plank, ExerciseCategory.CORE, LogType.TIME);

        // Nothing logged as a time yet: no "last time", no records.
        assertThat(sessions.findLastSets(workout.getId(), plank.getId(), null)).isEmpty();
        assertThat(history.history(plank.getId(), 0, 10).records().bestSet()).isNull();

        Session time = finishedSession(plank, new CreateSetRequest(null, null, 90, null, null));

        assertThat(sessions.findLastSets(workout.getId(), plank.getId(), null))
            .extracting(ExerciseSet::getDurationSeconds).containsExactly(90);
        History h = history.history(plank.getId(), 0, 10);
        assertThat(h.records().logType()).isEqualTo(LogType.TIME);
        assertThat(h.records().bestSet().durationSeconds()).isEqualTo(90);
        // Both sessions are listed, each with its own type; only the new one has a ★.
        assertThat(h.sessions()).extracting(HistorySession::sessionId, HistorySession::logType)
            .containsExactly(org.assertj.core.groups.Tuple.tuple(time.getId(), LogType.TIME),
                             org.assertj.core.groups.Tuple.tuple(reps.getId(), LogType.REPS));
        assertThat(h.sessions().get(1).sets()).extracting(HistorySet::pr).containsExactly(false);

        // Changing back brings the old ones back.
        update(plank, ExerciseCategory.CORE, LogType.REPS);
        assertThat(sessions.findLastSets(workout.getId(), plank.getId(), null))
            .extracting(ExerciseSet::getReps).containsExactly(20);
        assertThat(history.history(plank.getId(), 0, 10).records().bestSet().reps()).isEqualTo(20);
    }

    // --- records by type ---

    @Test
    void repsAndTimeRecordsAreTheMostAndTheLongest() {
        Exercise pushUp = inWorkout(exercise("Push-up", ExerciseCategory.CHEST, LogType.REPS));
        finishedSession(pushUp, new CreateSetRequest(null, 20, null, null, null),
                                new CreateSetRequest(null, 25, null, null, null),
                                new CreateSetRequest(null, 15, null, null, null));
        assertThat(history.history(pushUp.getId(), 0, 10).records())
            .satisfies(r -> assertThat(r.bestSet().reps()).isEqualTo(25))
            .satisfies(r -> assertThat(r.heaviest()).isNull());

        Exercise plank = inWorkout(exercise("Plank", ExerciseCategory.CORE, LogType.TIME));
        finishedSession(plank, new CreateSetRequest(null, null, 60, null, null),
                               new CreateSetRequest(null, null, 105, null, null));
        assertThat(history.history(plank.getId(), 0, 10).records().bestSet().durationSeconds()).isEqualTo(105);
    }

    @Test
    void distanceRecordsAreTheLongestDistanceAndTheFastestPace() {
        Exercise run = inWorkout(exercise("Treadmill Run", ExerciseCategory.CARDIO, null));
        finishedSession(run, new CreateSetRequest(null, null, 1800, 5.0, null),    // 6:00 / km
                             new CreateSetRequest(null, null, 1100, 2.0, null),    // 9:10 / km
                             new CreateSetRequest(null, null, 1000, 3.0, null));   // 5:33 / km

        History h = history.history(run.getId(), 0, 10);

        assertThat(h.records().bestSet().distanceKm()).isEqualTo(5.0);
        assertThat(h.records().fastestPace().distanceKm()).isEqualTo(3.0);
        assertThat(h.sessions().get(0).sets()).extracting(HistorySet::pr).containsExactly(true, false, false);
    }

    @Test
    void withoutADistanceTheLongestTimeIsBest() {
        Exercise rope = inWorkout(exercise("Rope Jumping", ExerciseCategory.CARDIO, null));
        finishedSession(rope, new CreateSetRequest(null, null, 300, null, null),
                              new CreateSetRequest(null, null, 600, null, null));

        History h = history.history(rope.getId(), 0, 10);

        assertThat(h.records().bestSet().durationSeconds()).isEqualTo(600);
        assertThat(h.records().fastestPace()).isNull();
    }

    // --- helpers ---

    private Exercise exercise(String name, ExerciseCategory category, LogType type) {
        return exercises.create(new CreateExerciseRequest(name, category, null, null, null, null, null, false, type));
    }

    private Exercise inWorkout(Exercise exercise) {
        em.persist(new WorkoutExercise(workout, exercise, 0));
        return exercise;
    }

    private void update(Exercise exercise, ExerciseCategory category, LogType type) {
        exercises.update(exercise.getId(),
            new UpdateExerciseRequest(exercise.getName(), category, null, null, null, null, false, type));
    }

    private Session finishedSession(Exercise exercise, CreateSetRequest... sets) {
        Session s = sessions.createSession(workout.getId());
        for (CreateSetRequest set : List.of(sets)) sessions.createSet(s.getId(), exercise.getId(), set);
        return sessions.finishSession(s.getId(), null);
    }
}
