package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.LocalDateTime;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.context.annotation.Import;

import com.tsu2track.fitness_tracker.service.CalendarPlans;
import com.tsu2track.fitness_tracker.service.ExerciseNotes;
import com.tsu2track.fitness_tracker.security.CurrentUser;
import com.tsu2track.fitness_tracker.service.SessionService;
import com.tsu2track.fitness_tracker.service.WeeklyGoals;

/* Home page stats: finished sessions in a Monday–Sunday week, the
   most recent finished session, the week streak (weeks that met their
   weekly goal) and the next plan. */
@DataJpaTest
@ExtendWith(LoggedIn.class)
@Import({ SessionService.class, ExerciseNotes.class, WeeklyGoals.class, CalendarPlans.class })
class HomeOverviewTest {

    private static final LocalDate MONDAY = LocalDate.of(2026, 10, 19);
    private static final int MON_THU = 0b0001001;

    @Autowired TestEntityManager em;
    @Autowired SessionService sessionService;
    @Autowired WeeklyGoals weeklyGoals;

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
    void withAGoalAWeekNeedsThatMany() {
        weeklyGoals.record(MONDAY.minusWeeks(10), 2);
        session(upper, MONDAY.plusDays(1), true);         // this week: 2
        session(legs, MONDAY.plusDays(1), true);          // same day: counts twice
        session(upper, MONDAY.minusDays(2), true);        // last week: 2
        session(upper, MONDAY.minusDays(5), true);
        session(upper, MONDAY.minusWeeks(2), true);       // two weeks back: only 1, breaks it

        assertThat(sessionService.countWeekStreak(MONDAY)).isEqualTo(2);
    }

    @Test
    void thisWeekBelowTheGoalDoesNotBreakIt() {
        weeklyGoals.record(MONDAY.minusWeeks(10), 2);
        session(upper, MONDAY, true);                     // this week: 1 of 2 so far
        session(upper, MONDAY.minusDays(1), true);        // last week: 2
        session(legs, MONDAY.minusDays(3), true);

        assertThat(sessionService.countWeekStreak(MONDAY)).isEqualTo(1);
    }

    @Test
    void pastWeeksKeepTheGoalTheyHad() {
        weeklyGoals.record(MONDAY.minusWeeks(10), 1);
        session(upper, MONDAY.minusWeeks(1), true);       // 1 a week, met
        session(upper, MONDAY.minusWeeks(2), true);
        session(upper, MONDAY, true);                     // this week: 1
        assertThat(sessionService.countWeekStreak(MONDAY)).isEqualTo(3);

        // Raised to 2 this week: only this week needs 2 now.
        weeklyGoals.record(MONDAY, 2);
        assertThat(sessionService.countWeekStreak(MONDAY)).isEqualTo(2);
        session(legs, MONDAY.plusDays(2), true);
        assertThat(sessionService.countWeekStreak(MONDAY)).isEqualTo(3);
    }

    @Test
    void theLastChangeInAWeekCounts() {
        weeklyGoals.record(MONDAY.minusWeeks(10), 3);
        session(upper, MONDAY.minusWeeks(1), true);       // last week: 1
        weeklyGoals.record(MONDAY.minusWeeks(1), 2);
        weeklyGoals.record(MONDAY.minusWeeks(1), 1);      // lowered again the same week

        assertThat(sessionService.countWeekStreak(MONDAY)).isEqualTo(1);
    }

    @Test
    void removingTheGoalGoesBackToOneAWeek() {
        weeklyGoals.record(MONDAY.minusWeeks(10), 3);
        weeklyGoals.record(MONDAY.minusWeeks(1), null);
        session(upper, MONDAY.minusWeeks(1), true);
        session(upper, MONDAY, true);

        assertThat(sessionService.countWeekStreak(MONDAY)).isEqualTo(2);
    }

    @Test
    void withNoRecordedChangeTheProfilesGoalStands() {
        UserProfile profile = new UserProfile(CurrentUser.id());
        profile.setName("Long");
        profile.setWeeklyGoal(2);
        profile.setUpdatedAt(LocalDateTime.now());
        em.persist(profile);
        session(upper, MONDAY.minusWeeks(1), true);       // 1 of 2: not met
        session(upper, MONDAY.minusWeeks(2), true);
        session(legs, MONDAY.minusWeeks(2), true);

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

    @Test
    void countsOnlyThatDaysPlansStillToDo() {
        plan(upper, MONDAY, ScheduleStatus.PLANNED);
        plan(legs, MONDAY, ScheduleStatus.PLANNED);
        plan(upper, MONDAY, ScheduleStatus.COMPLETED);   // done: not counted
        plan(legs, MONDAY.plusDays(1), ScheduleStatus.PLANNED);  // other day

        assertThat(sessionService.countPlannedOn(MONDAY)).isEqualTo(2);
    }

    // --- Repeat rules (V15): their days count as plans until saved. ---

    @Test
    void aRuleDayIsNextWhenNothingIsSaved() {
        repeat(upper, MON_THU, MONDAY, null);

        // Tuesday: Thursday is next, unsaved (no id).
        assertThat(sessionService.findNextPlanned(MONDAY.plusDays(1))).get()
            .satisfies(next -> {
                assertThat(next.getId()).isNull();
                assertThat(next.getWorkoutId()).isEqualTo(upper.getId());
                assertThat(next.getDate()).isEqualTo(MONDAY.plusDays(3));
                assertThat(next.getRepeatDate()).isEqualTo(MONDAY.plusDays(3));
            });
    }

    @Test
    void aSavedPlanBeforeTheRuleDayIsNext() {
        repeat(upper, MON_THU, MONDAY, null);
        ScheduledWorkout wed = plan(legs, MONDAY.plusDays(2), ScheduleStatus.PLANNED);

        assertThat(sessionService.findNextPlanned(MONDAY.plusDays(1))).get()
            .extracting(ScheduledWorkout::getId).isEqualTo(wed.getId());
    }

    @Test
    void aRuleDayBeforeASavedPlanIsNext() {
        repeat(upper, MON_THU, MONDAY, null);
        plan(legs, MONDAY.plusDays(4), ScheduleStatus.PLANNED);

        assertThat(sessionService.findNextPlanned(MONDAY)).get()
            .satisfies(next -> {
                assertThat(next.getWorkoutId()).isEqualTo(upper.getId());
                assertThat(next.getDate()).isEqualTo(MONDAY);
            });
    }

    @Test
    void onTheSameDaySavedPlansComeFirstAndBothCount() {
        repeat(upper, MON_THU, MONDAY, null);
        ScheduledWorkout legsToday = plan(legs, MONDAY, ScheduleStatus.PLANNED);

        assertThat(sessionService.findNextPlanned(MONDAY)).get()
            .extracting(ScheduledWorkout::getId).isEqualTo(legsToday.getId());
        assertThat(sessionService.countPlannedOn(MONDAY)).isEqualTo(2);
    }

    @Test
    void aRuleDayAlreadyDoneIsntNext() {
        repeat(upper, MON_THU, MONDAY, null);
        plan(upper, MONDAY, ScheduleStatus.COMPLETED);

        assertThat(sessionService.findNextPlanned(MONDAY)).get()
            .extracting(ScheduledWorkout::getDate).isEqualTo(MONDAY.plusDays(3));
        assertThat(sessionService.countPlannedOn(MONDAY)).isZero();
    }

    @Test
    void aRuleDayMovedAwayIsntCountedOnItsDay() {
        repeat(upper, MON_THU, MONDAY, null);
        ScheduledWorkout moved = plan(upper, MONDAY.plusDays(1), ScheduleStatus.PLANNED);
        moved.setRepeatDate(MONDAY);
        em.flush();

        assertThat(sessionService.countPlannedOn(MONDAY)).isZero();
        assertThat(sessionService.findNextPlanned(MONDAY)).get()
            .extracting(ScheduledWorkout::getId).isEqualTo(moved.getId());
    }

    @Test
    void aRuleStartingMonthsAheadIsStillFound() {
        WorkoutRepeat rule = new WorkoutRepeat();
        rule.setWorkout(upper);
        rule.setStartDate(MONDAY.plusDays(200));
        rule.setEveryDays(30);
        em.persist(rule);
        em.flush();

        assertThat(sessionService.findNextPlanned(MONDAY)).get()
            .extracting(ScheduledWorkout::getDate).isEqualTo(MONDAY.plusDays(200));
    }

    @Test
    void anEndedRulePlansNothing() {
        repeat(upper, MON_THU, MONDAY.minusWeeks(3), MONDAY.minusDays(1));

        assertThat(sessionService.findNextPlanned(MONDAY)).isEmpty();
        assertThat(sessionService.countPlannedOn(MONDAY)).isZero();
    }

    private void repeat(Workout w, int weekdays, LocalDate start, LocalDate end) {
        WorkoutRepeat rule = new WorkoutRepeat();
        rule.setWorkout(w);
        rule.setStartDate(start);
        rule.setEndDate(end);
        rule.setWeekdays(weekdays);
        em.persist(rule);
        em.flush();
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
