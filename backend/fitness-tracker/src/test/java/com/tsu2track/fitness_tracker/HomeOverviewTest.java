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

/* Home page stats: finished sessions in a Monday–Sunday week, the
   most recent finished session, the week streak and the next plan. */
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

    @Test
    void streakCountsWeeksInARowIncludingThisOne() {
        session(upper, MONDAY.plusDays(2), true);         // this week
        session(upper, MONDAY.minusDays(1), true);        // last week (Sunday)
        session(legs, MONDAY.minusDays(1), true);         // same day twice: still one week
        session(upper, MONDAY.minusWeeks(2), true);       // two weeks back
        session(upper, MONDAY.minusWeeks(4), true);       // after a gap: not counted

        assertThat(sessionService.countWeekStreak(MONDAY)).isEqualTo(3);
    }

    @Test
    void emptyCurrentWeekKeepsLastWeeksStreak() {
        session(upper, MONDAY.minusDays(3), true);
        session(upper, MONDAY.minusWeeks(2), true);

        assertThat(sessionService.countWeekStreak(MONDAY)).isEqualTo(2);
    }

    @Test
    void streakIgnoresUnfinishedAndFutureSessions() {
        session(upper, MONDAY.minusWeeks(1), false);      // in progress: not a training week
        session(upper, MONDAY.plusWeeks(1), true);        // next week: ignored

        assertThat(sessionService.countWeekStreak(MONDAY)).isZero();
    }

    @Test
    void streakIsBrokenByAMissedWeek() {
        session(upper, MONDAY.minusWeeks(2), true);

        assertThat(sessionService.countWeekStreak(MONDAY)).isZero();
    }

    @Test
    void nextPlannedIsTheEarliestPlanFromToday() {
        LocalDate today = MONDAY.plusDays(2);
        plan(upper, today.minusDays(1), ScheduleStatus.PLANNED);   // missed yesterday: past
        plan(upper, today, ScheduleStatus.COMPLETED);              // done today
        ScheduledWorkout next = plan(legs, today.plusDays(1), ScheduleStatus.PLANNED);
        plan(upper, today.plusDays(3), ScheduleStatus.PLANNED);

        assertThat(sessionService.findNextPlanned(today)).get()
            .extracting(ScheduledWorkout::getId).isEqualTo(next.getId());
    }

    @Test
    void planForTodayCountsAsNext() {
        ScheduledWorkout todays = plan(upper, MONDAY, ScheduleStatus.PLANNED);

        assertThat(sessionService.findNextPlanned(MONDAY)).get()
            .extracting(ScheduledWorkout::getId).isEqualTo(todays.getId());
    }

    @Test
    void nothingPlanned() {
        plan(upper, MONDAY.plusDays(1), ScheduleStatus.SKIPPED);

        assertThat(sessionService.findNextPlanned(MONDAY)).isEmpty();
    }

    private ScheduledWorkout plan(Workout w, LocalDate date, ScheduleStatus status) {
        ScheduledWorkout sw = new ScheduledWorkout();
        sw.setWorkout(w);
        sw.setDate(date);
        sw.setStatus(status);
        ScheduledWorkout saved = em.persist(sw);
        em.flush();
        return saved;
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
