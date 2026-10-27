package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import com.tsu2track.fitness_tracker.service.RepeatDates;

/* Which days a repeat rule plans in a range. Plain unit tests: no Spring,
   no database. 2 Mar 2026 is a Monday. */
class RepeatDatesTest {

    private static final LocalDate MON = LocalDate.of(2026, 3, 2);
    private static final int MON_THU = 0b0001001;
    private static final int SAT_SUN = 0b1100000;

    @Test
    void weeklyPlansTheChosenDays() {
        assertThat(RepeatDates.between(weekly(MON_THU, MON, null), MON, MON.plusDays(13)))
            .containsExactly(d(2026, 3, 2), d(2026, 3, 5), d(2026, 3, 9), d(2026, 3, 12));
    }

    @Test
    void weeklyWithTheWeekendBits() {
        assertThat(RepeatDates.between(weekly(SAT_SUN, MON, null), MON, MON.plusDays(6)))
            .containsExactly(d(2026, 3, 7), d(2026, 3, 8));
    }

    @Test
    void everyDayOfTheWeek() {
        assertThat(RepeatDates.between(weekly(0b1111111, MON, null), MON, MON.plusDays(6))).hasSize(7);
    }

    @Test
    void nothingBeforeTheStartDate() {
        // Starts on a Wednesday: that week's Monday isn't planned.
        assertThat(RepeatDates.between(weekly(MON_THU, MON.plusDays(2), null), MON, MON.plusDays(7)))
            .containsExactly(d(2026, 3, 5), d(2026, 3, 9));
    }

    @Test
    void theEndDateIsTheLastPlannedDay() {
        assertThat(RepeatDates.between(weekly(MON_THU, MON, d(2026, 3, 9)), MON, MON.plusDays(30)))
            .containsExactly(d(2026, 3, 2), d(2026, 3, 5), d(2026, 3, 9));
    }

    @Test
    void aRangeOutsideTheRuleIsEmpty() {
        WorkoutRepeat rule = weekly(MON_THU, MON, d(2026, 3, 31));
        assertThat(RepeatDates.between(rule, d(2026, 2, 1), d(2026, 2, 28))).isEmpty();
        assertThat(RepeatDates.between(rule, d(2026, 4, 1), d(2026, 4, 30))).isEmpty();
    }

    @Test
    void everyNDaysCountsFromTheStart() {
        assertThat(RepeatDates.between(every(3, MON, null), MON, MON.plusDays(10)))
            .containsExactly(d(2026, 3, 2), d(2026, 3, 5), d(2026, 3, 8), d(2026, 3, 11));
    }

    @Test
    void everyNDaysKeepsTheBeatWhenTheRangeStartsLater() {
        // The beat is 2, 5, 8, 11, 14, 17... Mar: a range from 15 Mar starts at 17.
        assertThat(RepeatDates.between(every(3, MON, null), d(2026, 3, 15), d(2026, 3, 24)))
            .containsExactly(d(2026, 3, 17), d(2026, 3, 20), d(2026, 3, 23));
        assertThat(RepeatDates.between(every(3, MON, null), d(2026, 3, 14), d(2026, 3, 14)))
            .containsExactly(d(2026, 3, 14));
    }

    @Test
    void everyNDaysRunsAcrossMonthsAndYears() {
        // 2 Dec 2026 + 30 days = 1 Jan 2027.
        assertThat(RepeatDates.between(every(30, d(2026, 12, 2), null), d(2026, 12, 1), d(2027, 2, 28)))
            .containsExactly(d(2026, 12, 2), d(2027, 1, 1), d(2027, 1, 31));
    }

    @Test
    void everyNDaysAcrossFebruaryOfALeapYear() {
        assertThat(RepeatDates.between(every(2, d(2028, 2, 27), null), d(2028, 2, 27), d(2028, 3, 3)))
            .containsExactly(d(2028, 2, 27), d(2028, 2, 29), d(2028, 3, 2));
    }

    @Test
    void everyDayIsEveryOneDays() {
        assertThat(RepeatDates.between(every(1, MON, MON.plusDays(2)), MON, MON.plusDays(10)))
            .containsExactly(d(2026, 3, 2), d(2026, 3, 3), d(2026, 3, 4));
    }

    @Test
    void everyNDaysStopsAtTheEndDate() {
        assertThat(RepeatDates.between(every(4, MON, d(2026, 3, 9)), MON, MON.plusDays(30)))
            .containsExactly(d(2026, 3, 2), d(2026, 3, 6));
    }

    @Test
    void aOneDayRangeOnAndOffThePlan() {
        WorkoutRepeat rule = weekly(MON_THU, MON, null);
        assertThat(RepeatDates.between(rule, d(2026, 3, 5), d(2026, 3, 5))).containsExactly(d(2026, 3, 5));
        assertThat(RepeatDates.between(rule, d(2026, 3, 6), d(2026, 3, 6))).isEmpty();
    }

    @Test
    void onWeekdayReadsTheMask() {
        assertThat(RepeatDates.onWeekday(MON_THU, MON)).isTrue();
        assertThat(RepeatDates.onWeekday(MON_THU, MON.plusDays(1))).isFalse();
        assertThat(RepeatDates.onWeekday(SAT_SUN, MON.plusDays(6))).isTrue();
    }

    private static WorkoutRepeat weekly(int mask, LocalDate start, LocalDate end) {
        WorkoutRepeat r = rule(start, end);
        r.setWeekdays(mask);
        return r;
    }

    private static WorkoutRepeat every(int n, LocalDate start, LocalDate end) {
        WorkoutRepeat r = rule(start, end);
        r.setEveryDays(n);
        return r;
    }

    private static WorkoutRepeat rule(LocalDate start, LocalDate end) {
        WorkoutRepeat r = new WorkoutRepeat();
        r.setStartDate(start);
        r.setEndDate(end);
        return r;
    }

    private static LocalDate d(int y, int m, int day) {
        return LocalDate.of(y, m, day);
    }
}
