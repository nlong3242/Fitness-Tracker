package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.tsu2track.fitness_tracker.service.SessionService;

/* finishSession writes the permanent history snapshot (SessionExercise rows):
   which exercises the session shows, in what order, under what name. */
@DataJpaTest
@ExtendWith(LoggedIn.class)
@Import(SessionService.class)
class SessionServiceFinishTest {

    @Autowired TestEntityManager em;
    @Autowired SessionService sessionService;
    @Autowired SessionExerciseRepository sessionExerciseRepository;

    private Workout workout;
    private Exercise bench;
    private Exercise row;
    private Exercise curl;
    private Session session;

    @BeforeEach
    void setUp() {
        workout = em.persist(new Workout("Upper"));
        bench = exercise("Bench Press", ExerciseCategory.CHEST);
        row = exercise("Row", ExerciseCategory.BACK);
        curl = exercise("Curl", ExerciseCategory.ARMS);
        // Workout order: bench, row, curl.
        em.persist(new WorkoutExercise(workout, bench, 0));
        em.persist(new WorkoutExercise(workout, row, 1));
        em.persist(new WorkoutExercise(workout, curl, 2));
        session = new Session();
        session.setWorkout(workout);
        session.setDate(LocalDate.of(2026, 1, 5));
        session = em.persist(session);
    }

    @Test
    void withoutAnOrderUsesTheWorkoutsOrder() {
        finish(null);

        assertThat(snapshotNames()).containsExactly("Bench Press", "Row", "Curl");
    }

    @Test
    void usesTheOrderTheUserArrangedThenAppendsTheRest() {
        finish(List.of(curl.getId(), bench.getId()));

        assertThat(snapshotNames()).containsExactly("Curl", "Bench Press", "Row");
    }

    @Test
    void ignoresIdsThatAreNotInTheWorkout() {
        finish(List.of(999_999L, row.getId()));

        assertThat(snapshotNames()).containsExactly("Row", "Bench Press", "Curl");
    }

    @Test
    void keepsAnExerciseThatHasSetsButWasRemovedFromTheWorkout() {
        Exercise dips = exercise("Dips", ExerciseCategory.CHEST);
        set(dips, 0, 10); // logged this session, but never part of the workout

        finish(null);

        assertThat(snapshotNames()).containsExactly("Bench Press", "Row", "Curl", "Dips");
    }

    @Test
    void snapshotKeepsTheNameFromFinishTime() {
        finish(null);
        Exercise renamed = em.find(Exercise.class, bench.getId());
        renamed.setName("Flat Bench");
        em.flush();
        em.clear();

        assertThat(snapshotNames()).first().isEqualTo("Bench Press");
    }

    @Test
    void positionsAreSequentialFromZero() {
        finish(null);

        assertThat(snapshots()).extracting(SessionExercise::getPosition).containsExactly(0, 1, 2);
    }

    @Test
    void marksTheSessionFinished() {
        Session result = finish(null);

        assertThat(result.isFinished()).isTrue();
        assertThat(em.find(Session.class, session.getId()).isFinished()).isTrue();
    }

    @Test
    void finishingTwiceDoesNotDuplicateTheSnapshot() {
        finish(null);
        finish(List.of(curl.getId()));

        assertThat(snapshotNames()).containsExactly("Bench Press", "Row", "Curl");
    }

    @Test
    void unknownSessionIsNotFound() {
        assertThatThrownBy(() -> sessionService.finishSession(999_999L, null))
            .isInstanceOfSatisfying(ResponseStatusException.class,
                e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
    }

    // --- helpers ---

    private Session finish(List<Long> orderedExerciseIds) {
        em.flush();
        em.clear();
        Session result = sessionService.finishSession(session.getId(), orderedExerciseIds);
        em.flush();
        em.clear();
        return result;
    }

    private List<SessionExercise> snapshots() {
        return sessionExerciseRepository.findBySession_IdOrderByPositionAsc(session.getId());
    }

    private List<String> snapshotNames() {
        return snapshots().stream().map(SessionExercise::getName).toList();
    }

    private Exercise exercise(String name, ExerciseCategory category) {
        Exercise e = new Exercise(name);
        e.setCategory(category);
        return em.persist(e);
    }

    private void set(Exercise exercise, double weight, int reps) {
        ExerciseSet s = new ExerciseSet();
        s.setSession(em.find(Session.class, session.getId()));
        s.setExercise(exercise);
        s.setWeight(weight);
        s.setReps(reps);
        em.persist(s);
    }
}
