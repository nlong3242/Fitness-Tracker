package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.context.annotation.Import;

import com.tsu2track.fitness_tracker.service.SessionService;

/* Home page stats: finished sessions in a Monday–Sunday week, and the
   most recent finished session. */
@DataJpaTest
@Import(SessionService.class)
class HomeOverviewTest {

    private static final LocalDate MONDAY = LocalDate.of(2026, 10, 19);

    @Autowired TestEntityManager em;
    @Autowired SessionService sessionService;

    private Workout upper;
    private Workout legs;

    @BeforeEach
    void setUp() {
        upper = em.persist(new Workout("Upper"));
        legs = em.persist(new Workout("Legs"));
    }

    @Test
    void countsFinishedSessionsMondayThroughSunday() {
        session(upper, MONDAY.minusDays(1), true);  // Sunday before: out
        session(upper, MONDAY, true);               // in
        session(legs, MONDAY.plusDays(3), true);    // in
        session(upper, MONDAY.plusDays(6), true);   // Sunday: in
        session(upper, MONDAY.plusDays(7), true);   // next Monday: out

        assertThat(sessionService.countFinishedInWeek(MONDAY)).isEqualTo(3);
    }

    @Test
    void inProgressSessionsDoNotCount() {
        session(upper, MONDAY, true);
        session(upper, MONDAY.plusDays(1), false);

        assertThat(sessionService.countFinishedInWeek(MONDAY)).isEqualTo(1);
    }

    @Test
    void sameWorkoutTwiceInADayCountsTwice() {
        session(upper, MONDAY, true);
        session(upper, MONDAY, true);

        assertThat(sessionService.countFinishedInWeek(MONDAY)).isEqualTo(2);
    }

    @Test
    void lastSessionIsTheMostRecentFinishedOne() {
        session(upper, MONDAY, true);
        Session latest = session(legs, MONDAY.plusDays(2), true);
        session(upper, MONDAY.plusDays(4), false); // newer but still in progress

        assertThat(sessionService.findLastFinishedSession()).get()
            .extracting(Session::getId).isEqualTo(latest.getId());
    }

    @Test
    void sameDayTieGoesToTheLaterSession() {
        session(upper, MONDAY, true);
        Session second = session(legs, MONDAY, true);

        assertThat(sessionService.findLastFinishedSession()).get()
            .extracting(Session::getId).isEqualTo(second.getId());
    }

    @Test
    void nothingFinishedYet() {
        session(upper, MONDAY, false);

        assertThat(sessionService.findLastFinishedSession()).isEmpty();
        assertThat(sessionService.countFinishedInWeek(MONDAY)).isZero();
    }

    private Session session(Workout w, LocalDate date, boolean finished) {
        Session s = new Session();
        s.setWorkout(w);
        s.setDate(date);
        s.setFinished(finished);
        Session saved = em.persist(s);
        em.flush();
        return saved;
    }
}
