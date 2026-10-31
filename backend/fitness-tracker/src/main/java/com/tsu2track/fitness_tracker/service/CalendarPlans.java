package com.tsu2track.fitness_tracker.service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.tsu2track.fitness_tracker.RepeatDayCleared;
import com.tsu2track.fitness_tracker.RepeatDayClearedRepository;
import com.tsu2track.fitness_tracker.ScheduleStatus;
import com.tsu2track.fitness_tracker.ScheduledWorkout;
import com.tsu2track.fitness_tracker.ScheduledWorkoutRepository;
import com.tsu2track.fitness_tracker.WorkoutRepeat;
import com.tsu2track.fitness_tracker.WorkoutRepeatRepository;
import com.tsu2track.fitness_tracker.security.CurrentUser;

/* The calendar as the user sees it: saved entries plus the days repeat
   rules plan (V15). A rule's day is left out when the workout already has
   a saved entry on that date, one made from that day and moved (repeatDate,
   V16), or its entry was deleted (V17). Planned days that nobody has saved yet come back as
   unsaved entries: no id, PLANNED, repeatDate = date. */
@Component
public class CalendarPlans {
    // How far ahead Home looks for the next plan when only rules could
    // supply one (a rule plans at least once every 365 days).
    private static final int NEXT_LOOKAHEAD_DAYS = 400;

    private final ScheduledWorkoutRepository scheduled;
    private final WorkoutRepeatRepository repeats;
    private final RepeatDayClearedRepository cleared;

    public CalendarPlans(ScheduledWorkoutRepository scheduled, WorkoutRepeatRepository repeats,
                         RepeatDayClearedRepository cleared) {
        this.scheduled = scheduled;
        this.repeats = repeats;
        this.cleared = cleared;
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
        for (RepeatDayCleared c : cleared.findByUserIdAndClearedDateBetween(userId, from, to)) {
            taken.add(key(c.getWorkoutId(), c.getClearedDate()));
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

    /* The earliest plan still to do from today: a saved PLANNED entry or a
       rule's day, saved ones first within a day. A saved plan bounds the
       search, so rules are only expanded up to it. */
    public Optional<ScheduledWorkout> next(LocalDate today) {
        LocalDate until = scheduled
            .findFirstByUserIdAndStatusAndDateGreaterThanEqualOrderByDateAscCreatedAtAsc(
                CurrentUser.id(), ScheduleStatus.PLANNED, today)
            .map(ScheduledWorkout::getDate)
            .orElse(today.plusDays(NEXT_LOOKAHEAD_DAYS));
        return between(today, until).stream()
            .filter(s -> s.getStatus() == ScheduleStatus.PLANNED)
            .findFirst();
    }

    // Plans still to do on a day, saved and from rules.
    public long countPlannedOn(LocalDate date) {
        return on(date).stream().filter(s -> s.getStatus() == ScheduleStatus.PLANNED).count();
    }

    // Whether a rule of this workout plans this day.
    public boolean plans(Long workoutId, LocalDate day) {
        return repeats.findByWorkout_IdOrderByStartDateAsc(workoutId).stream()
            .anyMatch(rule -> !RepeatDates.between(rule, day, day).isEmpty());
    }

    // Whether a rule's unsaved day of this workout is showing on this date.
    public boolean hasUnsavedDay(Long workoutId, LocalDate date) {
        return on(date).stream()
            .anyMatch(s -> s.getId() == null && s.getWorkoutId().equals(workoutId));
    }

    /* An entry is being deleted: keep its day gone. That's the day it was made
       from; an entry not made from a rule can only be on a planned day if the
       rule came later, and then it's that day's plan. */
    public void clearDaysOf(ScheduledWorkout entry) {
        if (entry.getRepeatDate() != null) clear(entry, entry.getRepeatDate());
        else if (plans(entry.getWorkoutId(), entry.getDate())) clear(entry, entry.getDate());
    }

    private void clear(ScheduledWorkout entry, LocalDate day) {
        if (!cleared.existsByWorkout_IdAndClearedDate(entry.getWorkoutId(), day)) {
            cleared.save(new RepeatDayCleared(entry.getWorkout(), day));
        }
    }

    public boolean isCleared(Long workoutId, LocalDate day) {
        return cleared.existsByWorkout_IdAndClearedDate(workoutId, day);
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
