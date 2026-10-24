package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.context.annotation.Import;
import org.springframework.web.server.ResponseStatusException;

import com.tsu2track.fitness_tracker.service.ExerciseHistoryService;
import com.tsu2track.fitness_tracker.service.ExerciseHistoryService.History;
import com.tsu2track.fitness_tracker.service.ExerciseHistoryService.HistorySession;
import com.tsu2track.fitness_tracker.service.ExerciseHistoryService.HistorySet;

/* Exercise history: finished sessions of an exercise across workouts,
   newest first and paged, its PRs, and the ★ on sets whose weight × reps
   beat every earlier set. */
@DataJpaTest
@Import(ExerciseHistoryService.class)
class ExerciseHistoryTest {

    private static final LocalDate DAY = LocalDate.of(2026, 10, 1);

    @Autowired TestEntityManager em;
    @Autowired ExerciseHistoryService service;

    private Workout upper;
    private Workout push;
    private Exercise bench;

    @BeforeEach
    void setUp() {
        upper = em.persist(new Workout("Upper"));
        push = em.persist(new Workout("Push"));
        bench = exercise("Bench Press", false);
    }

    @Test
    void coversEveryWorkoutNewestFirstAndSkipsUnfinished() {
        Session a = session(upper, DAY, true);
        set(a, bench, 60, 8, null);
        Session b = session(push, DAY.plusDays(2), true);
        set(b, bench, 62.5, 6, null);
        Session live = session(upper, DAY.plusDays(4), false);
        set(live, bench, 100, 10, null);
        set(session(upper, DAY.plusDays(3), true), exercise("Squat", false), 100, 5, null);

        History h = service.history(bench.getId(), 0, 10);

        assertThat(h.sessions()).extracting(HistorySession::sessionId).containsExactly(b.getId(), a.getId());
        assertThat(h.sessions()).extracting(HistorySession::workoutId).containsExactly(push.getId(), upper.getId());
        assertThat(h.sessions().get(1).sets()).extracting(HistorySet::weight).containsExactly(60.0);
        assertThat(h.records().heaviest().weight()).isEqualTo(62.5);   // the live 100 kg doesn't count
    }

    @Test
    void starsSetsThatBeatEveryEarlierWeightTimesReps() {
        Session first = session(upper, DAY, true);
        set(first, bench, 60, 8, null);      // 480: first ever, no star
        set(first, bench, 60, 10, null);     // 600: beats 480 ★
        Session second = session(upper, DAY.plusDays(7), true);
        set(second, bench, 80, 5, null);     // 400: no
        set(second, bench, 50, 12, null);    // 600: ties, no
        set(second, bench, 40, 20, null);    // 800 ★

        History h = service.history(bench.getId(), 0, 10);

        assertThat(h.sessions().get(1).sets()).extracting(HistorySet::pr).containsExactly(false, true);
        assertThat(h.sessions().get(0).sets()).extracting(HistorySet::pr).containsExactly(false, false, true);
    }

    @Test
    void recordsAreHeaviestWeightAndBestEstimatedOneRepMax() {
        Session first = session(upper, DAY, true);
        set(first, bench, 80, 3, null);      // 1RM 88
        set(first, bench, 70, 10, null);     // 1RM 93.3 → best set
        Session second = session(upper, DAY.plusDays(7), true);
        set(second, bench, 80, 4, null);     // same weight, more reps → heaviest (1RM 90.7)

        var r = service.history(bench.getId(), 0, 10).records();

        assertThat(r.heaviest()).extracting("weight", "reps", "date").containsExactly(80.0, 4, DAY.plusDays(7));
        assertThat(r.bestSet()).extracting("weight", "reps", "date").containsExactly(70.0, 10, DAY);
    }

    @Test
    void sidesAreComparedSeparately() {
        Exercise curl = exercise("DB Curl", true);
        Session first = session(upper, DAY, true);
        set(first, curl, 12, 10, Side.LEFT);
        set(first, curl, 10, 10, Side.RIGHT);
        Session second = session(upper, DAY.plusDays(7), true);
        set(second, curl, 11, 10, Side.LEFT);    // below LEFT's best: no
        set(second, curl, 11, 10, Side.RIGHT);   // beats RIGHT's best ★

        List<HistorySet> latest = service.history(curl.getId(), 0, 10).sessions().get(0).sets();

        assertThat(latest).extracting(HistorySet::side).containsExactly(Side.LEFT, Side.RIGHT);
        assertThat(latest).extracting(HistorySet::pr).containsExactly(false, true);
    }

    @Test
    void bodyweightSetsCompareByRepsAndHaveNoRecords() {
        Exercise pullUp = exercise("Pull-up", false);
        set(session(upper, DAY, true), pullUp, 0, 8, null);
        set(session(upper, DAY.plusDays(7), true), pullUp, 0, 10, null);

        History h = service.history(pullUp.getId(), 0, 10);

        assertThat(h.sessions().get(0).sets().get(0).pr()).isTrue();
        assertThat(h.records().heaviest()).isNull();
        assertThat(h.records().bestSet()).isNull();
    }

    @Test
    void pagesNewestFirst() {
        for (int i = 0; i < 5; i++) set(session(upper, DAY.plusDays(i), true), bench, 60, 8, null);

        History p0 = service.history(bench.getId(), 0, 2);
        History p2 = service.history(bench.getId(), 2, 2);

        assertThat(p0.sessions()).extracting(HistorySession::date).containsExactly(DAY.plusDays(4), DAY.plusDays(3));
        assertThat(p0.hasMore()).isTrue();
        assertThat(p2.sessions()).extracting(HistorySession::date).containsExactly(DAY);
        assertThat(p2.hasMore()).isFalse();
        assertThat(service.history(bench.getId(), 9, 2).sessions()).isEmpty();
    }

    @Test
    void nothingFinishedYet() {
        History h = service.history(bench.getId(), 0, 10);

        assertThat(h.sessions()).isEmpty();
        assertThat(h.hasMore()).isFalse();
        assertThat(h.records().heaviest()).isNull();
    }

    @Test
    void unknownExerciseIs404() {
        assertThatThrownBy(() -> service.history(9999L, 0, 10))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("404");
    }

    private Exercise exercise(String name, boolean unilateral) {
        Exercise e = new Exercise(name);
        e.setCategory(ExerciseCategory.CHEST);
        e.setUnilateral(unilateral);
        return em.persist(e);
    }

    private Session session(Workout w, LocalDate date, boolean finished) {
        Session s = new Session();
        s.setWorkout(w);
        s.setDate(date);
        s.setFinished(finished);
        return em.persist(s);
    }

    private void set(Session session, Exercise exercise, double weight, int reps, Side side) {
        ExerciseSet s = new ExerciseSet();
        s.setSession(session);
        s.setExercise(exercise);
        s.setWeight(weight);
        s.setReps(reps);
        s.setSide(side);
        em.persist(s);
        em.flush();
    }
}
