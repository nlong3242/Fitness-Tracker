package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;

/* findLastSetsForExercise backs the "last time" numbers in a live workout:
   the sets of the most recent session of this workout that logged this
   exercise, optionally strictly before a given session (by date, then id). */
@DataJpaTest
@ExtendWith(LoggedIn.class)
class ExerciseSetRepositoryTest {

    private static final LocalDate DAY1 = LocalDate.of(2026, 1, 5);
    private static final LocalDate DAY2 = LocalDate.of(2026, 1, 12);

    @Autowired TestEntityManager em;
    @Autowired ExerciseSetRepository repository;

    private Workout workout;
    private Exercise bench;
    private Exercise squat;

    @BeforeEach
    void setUp() {
        workout = em.persist(new Workout("Upper"));
        bench = exercise("Bench Press", ExerciseCategory.CHEST);
        squat = exercise("Squat", ExerciseCategory.LEGS);
    }

    @Test
    void returnsSetsFromTheMostRecentSessionOnly() {
        Session older = session(workout, DAY1);
        set(older, bench, 60, 8);
        Session newer = session(workout, DAY2);
        ExerciseSet a = set(newer, bench, 65, 8);
        ExerciseSet b = set(newer, bench, 65, 6);

        assertThat(ids(lastSets(bench, null))).containsExactly(a.getId(), b.getId());
    }

    /* The frontend pairs previous sets with set rows by position, so the
       result must come back in logging (id) order. H2 happens to return
       rows in id order even without an ORDER BY, so this test alone can't
       prove the clause is there — it pins the contract, and was checked
       to fail against ORDER BY s.id DESC. */
    @Test
    void returnsSetsInTheOrderTheyWereLogged() {
        Session s = session(workout, DAY1);
        ExerciseSet first = set(s, bench, 60, 10);
        ExerciseSet second = set(s, bench, 70, 8);
        ExerciseSet third = set(s, bench, 80, 6);

        List<ExerciseSet> result = lastSets(bench, null);

        assertThat(ids(result)).containsExactly(first.getId(), second.getId(), third.getId());
        assertThat(result).extracting(ExerciseSet::getWeight).containsExactly(60.0, 70.0, 80.0);
    }

    @Test
    void sameDayTieGoesToTheLaterSession() {
        Session first = session(workout, DAY1);
        set(first, bench, 60, 8);
        Session second = session(workout, DAY1);
        ExerciseSet s = set(second, bench, 62.5, 8);

        assertThat(ids(lastSets(bench, null))).containsExactly(s.getId());
    }

    @Test
    void beforeSessionExcludesThatSessionAndLaterOnes() {
        Session previous = session(workout, DAY1);
        ExerciseSet p = set(previous, bench, 60, 8);
        Session current = session(workout, DAY2);
        set(current, bench, 65, 8);

        assertThat(ids(lastSets(bench, current))).containsExactly(p.getId());
    }

    @Test
    void beforeSessionOnTheSameDayUsesIdOrder() {
        Session morning = session(workout, DAY1);
        ExerciseSet m = set(morning, bench, 60, 8);
        Session evening = session(workout, DAY1);
        set(evening, bench, 65, 8);

        assertThat(ids(lastSets(bench, evening))).containsExactly(m.getId());
        assertThat(lastSets(bench, morning)).isEmpty();
    }

    @Test
    void skipsSessionsThatDidNotLogThisExercise() {
        Session withBench = session(workout, DAY1);
        ExerciseSet b = set(withBench, bench, 60, 8);
        Session squatOnly = session(workout, DAY2);
        set(squatOnly, squat, 100, 5);

        assertThat(ids(lastSets(bench, null))).containsExactly(b.getId());
    }

    @Test
    void ignoresOtherWorkoutsUsingTheSameExercise() {
        Session mine = session(workout, DAY1);
        ExerciseSet s = set(mine, bench, 60, 8);
        Workout other = em.persist(new Workout("Push"));
        set(session(other, DAY2), bench, 80, 3);

        assertThat(ids(lastSets(bench, null))).containsExactly(s.getId());
    }

    @Test
    void emptyWhenNothingWasLogged() {
        session(workout, DAY1);

        assertThat(lastSets(bench, null)).isEmpty();
    }

    // --- helpers ---

    private List<ExerciseSet> lastSets(Exercise exercise, Session before) {
        em.flush();
        em.clear();
        return repository.findLastSetsForExercise(
            workout.getId(), exercise.getId(), exercise.getLogType(),
            before == null ? null : before.getId(),
            before == null ? null : before.getDate());
    }

    private Exercise exercise(String name, ExerciseCategory category) {
        Exercise e = new Exercise(name);
        e.setCategory(category);
        return em.persist(e);
    }

    private Session session(Workout w, LocalDate date) {
        Session s = new Session();
        s.setWorkout(w);
        s.setDate(date);
        return em.persist(s);
    }

    private ExerciseSet set(Session session, Exercise exercise, double weight, int reps) {
        ExerciseSet s = new ExerciseSet();
        s.setSession(session);
        s.setExercise(exercise);
        s.setWeight(weight);
        s.setReps(reps);
        return em.persist(s);
    }

    private static List<Long> ids(List<ExerciseSet> sets) {
        return sets.stream().map(ExerciseSet::getId).toList();
    }
}
