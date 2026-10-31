package com.tsu2track.fitness_tracker.service;

import java.time.LocalDate;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.tsu2track.fitness_tracker.ApiFieldException;
import com.tsu2track.fitness_tracker.RepeatDayClearedRepository;
import com.tsu2track.fitness_tracker.ScheduleStatus;
import com.tsu2track.fitness_tracker.ScheduledWorkout;
import com.tsu2track.fitness_tracker.ScheduledWorkoutRepository;
import com.tsu2track.fitness_tracker.Session;
import com.tsu2track.fitness_tracker.SessionRepository;
import com.tsu2track.fitness_tracker.Workout;
import com.tsu2track.fitness_tracker.WorkoutRepeat;
import com.tsu2track.fitness_tracker.WorkoutRepeatRepository;
import com.tsu2track.fitness_tracker.WorkoutRepository;
import com.tsu2track.fitness_tracker.dto.RepeatRequest;
import com.tsu2track.fitness_tracker.security.CurrentUser;

/* Setting, changing and stopping a workout's repeat rule. Changes only
   reach forward: the old rule ends the day before the new one starts (or
   is dropped if it hadn't started yet), so past weeks keep their plan,
   like weekly goals. "today" is the user's date, sent by the app. */
@Service
public class WorkoutRepeats {
    private final WorkoutRepeatRepository repeats;
    private final WorkoutRepository workouts;
    private final ScheduledWorkoutRepository scheduled;
    private final RepeatDayClearedRepository cleared;
    private final SessionRepository sessions;

    public WorkoutRepeats(WorkoutRepeatRepository repeats, WorkoutRepository workouts,
                          ScheduledWorkoutRepository scheduled, RepeatDayClearedRepository cleared,
                          SessionRepository sessions) {
        this.repeats = repeats;
        this.workouts = workouts;
        this.scheduled = scheduled;
        this.cleared = cleared;
        this.sessions = sessions;
    }

    // The rule in force today, or else the next one to start.
    public Optional<WorkoutRepeat> current(Long workoutId, LocalDate today) {
        workout(workoutId);
        return repeats.findByWorkout_IdOrderByStartDateAsc(workoutId).stream()
            .filter(r -> r.getEndDate() == null || !r.getEndDate().isBefore(today))
            .findFirst();
    }

    @Transactional
    public WorkoutRepeat set(Long workoutId, RepeatRequest req, LocalDate today) {
        Workout workout = workout(workoutId);
        if ((req.weekdays() == null) == (req.everyDays() == null)) {
            throw new ApiFieldException(HttpStatus.BAD_REQUEST, "weekdays", "Choose weekly days or every N days.");
        }
        LocalDate start = req.startDate() != null ? req.startDate() : today;
        if (start.isBefore(today)) {
            throw new ApiFieldException(HttpStatus.BAD_REQUEST, "startDate", "The start can't be in the past.");
        }
        if (req.endDate() != null && req.endDate().isBefore(start)) {
            throw new ApiFieldException(HttpStatus.BAD_REQUEST, "endDate", "The end can't be before the start.");
        }

        // From today, whatever the new start: no old days stay planned before it.
        endFrom(workoutId, today);
        WorkoutRepeat rule = new WorkoutRepeat();
        rule.setWorkout(workout);
        rule.setStartDate(start);
        rule.setEndDate(req.endDate());
        rule.setWeekdays(req.weekdays());
        rule.setEveryDays(req.everyDays());
        return repeats.save(rule);
    }

    // Stop: nothing planned from today on. Finished and skipped days stay.
    @Transactional
    public void stop(Long workoutId, LocalDate today) {
        workout(workoutId);
        endFrom(workoutId, today);
    }

    /* Rules end the day before `day`; ones that start on or after it go, along
       with what they left behind from then on, so the next rule starts clean:
       - plans saved from a repeat day (moved, noted, started) go, unless a
         session of the workout is still open on that date;
       - an entry that stays no longer holds on to a different day it came from;
       - days cleared by deleting their entry can be planned again. */
    private void endFrom(Long workoutId, LocalDate day) {
        Set<LocalDate> open = sessions.findByWorkout_Id(workoutId).stream()
            .filter(s -> !s.isFinished())
            .map(Session::getDate)
            .collect(Collectors.toSet());
        for (ScheduledWorkout s : scheduled.findByWorkout_Id(workoutId)) {
            LocalDate from = s.getRepeatDate();
            if (from == null) continue;
            if (s.getStatus() == ScheduleStatus.PLANNED && !s.getDate().isBefore(day) && !open.contains(s.getDate())) {
                scheduled.delete(s);
            } else if (!from.isBefore(day) && !from.equals(s.getDate())) {
                s.setRepeatDate(null);
            }
        }
        cleared.deleteAll(cleared.findByWorkout_Id(workoutId).stream()
            .filter(c -> !c.getClearedDate().isBefore(day))
            .toList());
        for (WorkoutRepeat r : repeats.findByWorkout_IdOrderByStartDateAsc(workoutId)) {
            if (!r.getStartDate().isBefore(day)) {
                repeats.delete(r);
            } else if (r.getEndDate() == null || !r.getEndDate().isBefore(day)) {
                r.setEndDate(day.minusDays(1));
            }
        }
        repeats.flush();
    }

    private Workout workout(Long workoutId) {
        return workouts.findByIdAndUserId(workoutId, CurrentUser.id())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Workout not found"));
    }
}
