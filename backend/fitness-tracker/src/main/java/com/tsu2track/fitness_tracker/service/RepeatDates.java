package com.tsu2track.fitness_tracker.service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import com.tsu2track.fitness_tracker.WorkoutRepeat;

/* The days a repeat rule plans, worked out on the fly for a range (V15
   stores only the rule). Weekly: the chosen weekdays. Every N days: the
   start date and every Nth day after it, fixed to the start, not to the
   last time the workout was done. Both stop at the end date. */
public final class RepeatDates {
    private RepeatDates() {}

    // Planned days between from and to (both inclusive), oldest first.
    public static List<LocalDate> between(WorkoutRepeat rule, LocalDate from, LocalDate to) {
        LocalDate first = later(from, rule.getStartDate());
        LocalDate last = rule.getEndDate() == null ? to : earlier(to, rule.getEndDate());
        List<LocalDate> dates = new ArrayList<>();
        if (first.isAfter(last)) return dates;

        if (rule.getWeekdays() != null) {
            int mask = rule.getWeekdays();
            for (LocalDate d = first; !d.isAfter(last); d = d.plusDays(1)) {
                if (onWeekday(mask, d)) dates.add(d);
            }
        } else {
            long n = rule.getEveryDays();
            long sinceStart = ChronoUnit.DAYS.between(rule.getStartDate(), first);
            // Round up to the next day on the rule's beat.
            LocalDate d = rule.getStartDate().plusDays((sinceStart + n - 1) / n * n);
            for (; !d.isAfter(last); d = d.plusDays(n)) dates.add(d);
        }
        return dates;
    }

    // Bit 0 = Monday ... bit 6 = Sunday.
    public static boolean onWeekday(int mask, LocalDate date) {
        return (mask & (1 << (date.getDayOfWeek().getValue() - 1))) != 0;
    }

    private static LocalDate later(LocalDate a, LocalDate b) {
        return a.isAfter(b) ? a : b;
    }

    private static LocalDate earlier(LocalDate a, LocalDate b) {
        return a.isBefore(b) ? a : b;
    }
}
