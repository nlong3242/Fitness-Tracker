package com.tsu2track.fitness_tracker.service;

import java.time.LocalDate;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.tsu2track.fitness_tracker.ApiFieldException;
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

    public WorkoutRepeats(WorkoutRepeatRepository repeats, WorkoutRepository workouts) {
        this.repeats = repeats;
        this.workouts = workouts;
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

    // Stop: nothing planned from today on. Days already saved (done,
    // skipped, moved) are calendar entries and stay.
    @Transactional
    public void stop(Long workoutId, LocalDate today) {
        workout(workoutId);
        endFrom(workoutId, today);
    }

    // Rules end the day before `day`; ones that start on or after it go.
    private void endFrom(Long workoutId, LocalDate day) {
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
