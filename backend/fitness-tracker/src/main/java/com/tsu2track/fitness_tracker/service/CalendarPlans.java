package com.tsu2track.fitness_tracker.service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.tsu2track.fitness_tracker.ScheduleStatus;
import com.tsu2track.fitness_tracker.ScheduledWorkout;
import com.tsu2track.fitness_tracker.ScheduledWorkoutRepository;
import com.tsu2track.fitness_tracker.WorkoutRepeat;
import com.tsu2track.fitness_tracker.WorkoutRepeatRepository;
import com.tsu2track.fitness_tracker.security.CurrentUser;

/* The calendar as the user sees it: saved entries plus the days repeat
   rules plan (V15). A rule's day is left out when the workout already has
   a saved entry on that date, or one made from that day and moved
   (repeatDate, V16). Planned days that nobody has saved yet come back as
   unsaved entries: no id, PLANNED, repeatDate = date. */
@Component
public class CalendarPlans {
    private final ScheduledWorkoutRepository scheduled;
    private final WorkoutRepeatRepository repeats;

    public CalendarPlans(ScheduledWorkoutRepository scheduled, WorkoutRepeatRepository repeats) {
        this.scheduled = scheduled;
        this.repeats = repeats;
    }

    // Saved entries first within a day (oldest first), then rule days.
    public List<ScheduledWorkout> between(LocalDate from, LocalDate to) {
        Long userId = CurrentUser.id();
        List<ScheduledWorkout> entries = new ArrayList<>(
            scheduled.findByUserIdAndDateBetweenOrderByDateAscCreatedAtAsc(userId, from, to));

        Set<String> taken = new HashSet<>();
        for (ScheduledWorkout s : entries) taken.add(key(s.getWorkoutId(), s.getDate()));
        for (ScheduledWorkout s : scheduled.findByUserIdAndRepeatDateBetween(userId, from, to)) {
            taken.add(key(s.getWorkoutId(), s.getRepeatDate()));
        }

        for (WorkoutRepeat rule : repeats.findOverlapping(userId, from, to)) {
            for (LocalDate day : RepeatDates.between(rule, from, to)) {
                if (taken.add(key(rule.getWorkoutId(), day))) entries.add(unsaved(rule, day));
            }
        }
        entries.sort(Comparator.comparing(ScheduledWorkout::getDate)
            .thenComparing(s -> s.getId() == null)
            .thenComparing(ScheduledWorkout::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder())));
        return entries;
    }

    public List<ScheduledWorkout> on(LocalDate date) {
        return between(date, date);
    }

    // Whether a rule of this workout plans this day.
    public boolean plans(Long workoutId, LocalDate day) {
        return repeats.findByWorkout_IdOrderByStartDateAsc(workoutId).stream()
            .anyMatch(rule -> !RepeatDates.between(rule, day, day).isEmpty());
    }

    private static ScheduledWorkout unsaved(WorkoutRepeat rule, LocalDate day) {
        ScheduledWorkout s = new ScheduledWorkout();
        s.setWorkout(rule.getWorkout());
        s.setDate(day);
        s.setRepeatDate(day);
        s.setStatus(ScheduleStatus.PLANNED);
        return s;
    }

    private static String key(Long workoutId, LocalDate day) {
        return workoutId + "@" + day;
    }
}
