package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.context.annotation.Import;

import com.tsu2track.fitness_tracker.dto.CreateSetRequest;
import com.tsu2track.fitness_tracker.dto.UpdateSetRequest;
import com.tsu2track.fitness_tracker.service.CalendarPlans;
import com.tsu2track.fitness_tracker.service.ExerciseNotes;
import com.tsu2track.fitness_tracker.service.SessionService;
import com.tsu2track.fitness_tracker.service.WeeklyGoals;

/* Session.lastActivityAt drives the app's idle auto-end: it must move on
   every set change, and only then. */
@DataJpaTest
@ExtendWith(LoggedIn.class)
@Import({ SessionService.class, ExerciseNotes.class, WeeklyGoals.class, CalendarPlans.class })
class SessionActivityTest {

    private static final Instant LONG_AGO = Instant.parse("2026-01-01T08:00:00Z");

    @Autowired TestEntityManager em;
    @Autowired SessionService sessionService;

    private Workout workout;
    private Exercise bench;

    @BeforeEach
    void setUp() {
        workout = em.persist(new Workout("Upper"));
        bench = new Exercise("Bench");
        bench.setCategory(ExerciseCategory.CHEST);
        bench = em.persist(bench);
    }

    @Test
    void newSessionStartsActiveNow() {
        Instant before = Instant.now().minusSeconds(1);

        Session s = sessionService.createSession(workout.getId());

        assertThat(s.getLastActivityAt()).isAfter(before);
    }

    @Test
    void loggingASetCountsAsActivity() {
        Session s = idleSession();

        sessionService.createSet(s.getId(), bench.getId(), new CreateSetRequest(60.0, 8, null, null, null));

        assertThat(reload(s).getLastActivityAt()).isAfter(LONG_AGO.plus(1, ChronoUnit.DAYS));
    }

    @Test
    void editingASetCountsAsActivity() {
        Session s = idleSession();
        ExerciseSet set = setIn(s);

        sessionService.updateSet(set.getId(), new UpdateSetRequest(65.0, 8, null, null));

        assertThat(reload(s).getLastActivityAt()).isAfter(LONG_AGO.plus(1, ChronoUnit.DAYS));
    }

    @Test
    void deletingASetCountsAsActivity() {
        Session s = idleSession();
        ExerciseSet set = setIn(s);

        sessionService.deleteSet(set.getId());

        assertThat(reload(s).getLastActivityAt()).isAfter(LONG_AGO.plus(1, ChronoUnit.DAYS));
    }

    @Test
    void readingDoesNotCountAsActivity() {
        Session s = idleSession();
        setIn(s);

        sessionService.findUnfinishedSession();
        sessionService.findSessionExercises(s.getId());

        assertThat(reload(s).getLastActivityAt()).isEqualTo(LONG_AGO);
    }

    // --- helpers ---

    private Session idleSession() {
        Session s = new Session();
        s.setWorkout(workout);
        s.setDate(java.time.LocalDate.of(2026, 1, 1));
        s.setLastActivityAt(LONG_AGO);
        s = em.persist(s);
        em.flush();
        em.clear();
        return s;
    }

    private ExerciseSet setIn(Session s) {
        ExerciseSet set = new ExerciseSet();
        set.setSession(em.find(Session.class, s.getId()));
        set.setExercise(em.find(Exercise.class, bench.getId()));
        set.setWeight(60);
        set.setReps(8);
        set = em.persist(set);
        em.flush();
        em.clear();
        return set;
    }

    private Session reload(Session s) {
        em.flush();
        em.clear();
        return em.find(Session.class, s.getId());
    }
}
