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
import org.springframework.web.server.ResponseStatusException;

import com.tsu2track.fitness_tracker.service.ExerciseHistoryService;
import com.tsu2track.fitness_tracker.service.ExerciseHistoryService.History;
import com.tsu2track.fitness_tracker.service.ExerciseHistoryService.HistorySession;
import com.tsu2track.fitness_tracker.service.ExerciseHistoryService.HistorySet;
import com.tsu2track.fitness_tracker.service.ExerciseHistoryService.TrendPoint;

/* Exercise history: finished sessions of an exercise across workouts,
   newest first and paged, its PRs, the single ★ on the Best set, and the
   chart's trend. */
@DataJpaTest
@ExtendWith(LoggedIn.class)
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
    void theOnlyStarIsOnTheBestSet() {
        // 30 × 13 has the most weight × reps (390), but 40 × 8 is the
        // stronger set (≈ 51 kg vs ≈ 43 kg one-rep max): it is Best set
        // and carries the one star.
        for (int reps = 10; reps <= 13; reps++) set(session(upper, DAY.plusDays(reps), true), bench, 30, reps, null);
        set(session(upper, DAY.plusDays(20), true), bench, 40, 8, null);

        History h = service.history(bench.getId(), 0, 10);

        assertThat(h.sessions()).flatExtracting(HistorySession::sets).filteredOn(HistorySet::pr)
            .singleElement().extracting(HistorySet::weight, HistorySet::reps).containsExactly(40.0, 8);
        assertThat(h.records().bestSet()).extracting("weight", "reps").containsExactly(40.0, 8);
    }

    @Test
    void aTiedBestSetKeepsTheStarOnTheEarlierOne() {
        Session first = session(upper, DAY, true);
        set(first, bench, 60, 8, null);
        Session second = session(upper, DAY.plusDays(7), true);
        set(second, bench, 60, 8, null);

        History h = service.history(bench.getId(), 0, 10);

        assertThat(h.sessions().get(1).sets().get(0).pr()).isTrue();    // first session (older)
        assertThat(h.sessions().get(0).sets().get(0).pr()).isFalse();
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
        assertThat(r.bestLeft()).isNull();
        assertThat(r.bestRight()).isNull();
    }

    @Test
    void unilateralHasABestSetAndStarPerSide() {
        Exercise curl = exercise("DB Curl", true);
        Session first = session(upper, DAY, true);
        set(first, curl, 12, 10, Side.LEFT);
        set(first, curl, 10, 10, Side.RIGHT);
        Session second = session(upper, DAY.plusDays(7), true);
        set(second, curl, 11, 10, Side.LEFT);
        set(second, curl, 11, 10, Side.RIGHT);

        History h = service.history(curl.getId(), 0, 10);

        // LEFT's best is 12 × 10 (first session), RIGHT's is 11 × 10 (second).
        assertThat(h.sessions().get(0).sets()).extracting(HistorySet::side).containsExactly(Side.LEFT, Side.RIGHT);
        assertThat(h.sessions().get(1).sets()).extracting(HistorySet::pr).containsExactly(true, false);
        assertThat(h.sessions().get(0).sets()).extracting(HistorySet::pr).containsExactly(false, true);
        assertThat(h.records().bestLeft()).extracting("weight", "date").containsExactly(12.0, DAY);
        assertThat(h.records().bestRight()).extracting("weight", "date").containsExactly(11.0, DAY.plusDays(7));
        assertThat(h.records().bestSet()).isNull();                     // no two-sided sets
        assertThat(h.records().heaviest().weight()).isEqualTo(12.0);    // one number, either side
    }

    @Test
    void bodyweightOnlyHasNoRecordsAndNoStar() {
        Exercise pullUp = exercise("Pull-up", false);
        set(session(upper, DAY, true), pullUp, 0, 8, null);
        set(session(upper, DAY.plusDays(7), true), pullUp, 0, 10, null);

        History h = service.history(pullUp.getId(), 0, 10);

        assertThat(h.sessions()).flatExtracting(HistorySession::sets).noneMatch(HistorySet::pr);
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
    void theTrendIsEachSessionsBestEstimatedMaxOldestFirst() {
        Session a = session(upper, DAY, true);
        set(a, bench, 60, 8, null);                       // 76
        set(a, bench, 70, 3, null);                       // 77: the session's best
        set(session(push, DAY.plusDays(3), true), bench, 80, 5, null);    // 93.33 → 93.3
        set(session(upper, DAY.plusDays(5), true), bench, 0, 12, null);   // bodyweight only: no point
        set(session(upper, DAY.plusDays(6), false), bench, 100, 5, null); // unfinished

        History h = service.history(bench.getId(), 0, 10);

        assertThat(h.trend().metric()).isEqualTo("MAX_KG");
        assertThat(h.trend().points()).extracting(TrendPoint::date, TrendPoint::value).containsExactly(
            org.assertj.core.groups.Tuple.tuple(DAY, 77.0),
            org.assertj.core.groups.Tuple.tuple(DAY.plusDays(3), 93.3));
    }

    @Test
    void sessionsOnTheSameDayShareTheirTrendPoint() {
        set(session(upper, DAY, true), bench, 60, 8, null);                 // 76
        set(session(push, DAY, true), bench, 80, 5, null);                  // 93.3: the day's best
        set(session(upper, DAY, true), bench, 70, 3, null);                 // 77
        set(session(upper, DAY.plusDays(2), true), bench, 80, 6, null);     // 96

        assertThat(service.history(bench.getId(), 0, 10).trend().points())
            .extracting(TrendPoint::date, TrendPoint::value).containsExactly(
                org.assertj.core.groups.Tuple.tuple(DAY, 93.3),
                org.assertj.core.groups.Tuple.tuple(DAY.plusDays(2), 96.0));
    }

    @Test
    void aUnilateralTrendHasAPointPerSide() {
        Exercise curl = exercise("One-Arm Curl", true);
        Session a = session(upper, DAY, true);
        set(a, curl, 12, 10, Side.LEFT);
        set(a, curl, 14, 6, Side.RIGHT);
        set(a, curl, 14, 8, Side.RIGHT);
        set(session(upper, DAY.plusDays(7), true), curl, 14, 10, Side.LEFT);

        assertThat(service.history(curl.getId(), 0, 10).trend().points())
            .extracting(TrendPoint::date, TrendPoint::side, TrendPoint::value).containsExactly(
                org.assertj.core.groups.Tuple.tuple(DAY, Side.LEFT, 16.0),
                org.assertj.core.groups.Tuple.tuple(DAY, Side.RIGHT, 17.7),
                org.assertj.core.groups.Tuple.tuple(DAY.plusDays(7), Side.LEFT, 18.7));
    }

    @Test
    void theTrendComesWithTheFirstPageOnly() {
        for (int i = 0; i < 3; i++) set(session(upper, DAY.plusDays(i), true), bench, 60, 8, null);

        assertThat(service.history(bench.getId(), 0, 2).trend().points()).hasSize(3);
        assertThat(service.history(bench.getId(), 1, 2).trend()).isNull();
    }

    @Test
    void nothingFinishedYet() {
        History h = service.history(bench.getId(), 0, 10);

        assertThat(h.sessions()).isEmpty();
        assertThat(h.hasMore()).isFalse();
        assertThat(h.records().heaviest()).isNull();
        assertThat(h.trend().points()).isEmpty();
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
