package com.tsu2track.fitness_tracker;

import java.time.LocalDate;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.tsu2track.fitness_tracker.dto.CreateScheduledWorkoutRequest;
import com.tsu2track.fitness_tracker.dto.UpdateScheduledWorkoutRequest;
import com.tsu2track.fitness_tracker.security.CurrentUser;
import com.tsu2track.fitness_tracker.service.CalendarPlans;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/scheduled-workouts")
public class ScheduledWorkoutController {

    // Repeat rules are expanded day by day, so a range is capped.
    private static final long MAX_RANGE_DAYS = 400;

    private final ScheduledWorkoutRepository scheduledWorkoutRepository;
    private final WorkoutRepository workoutRepository;
    private final SessionRepository sessionRepository;
    private final CalendarPlans calendarPlans;

    public ScheduledWorkoutController(
        ScheduledWorkoutRepository scheduledWorkoutRepository,
        WorkoutRepository workoutRepository,
        SessionRepository sessionRepository,
        CalendarPlans calendarPlans
    ) {
        this.scheduledWorkoutRepository = scheduledWorkoutRepository;
        this.workoutRepository = workoutRepository;
        this.sessionRepository = sessionRepository;
        this.calendarPlans = calendarPlans;
    }

    @GetMapping
    public List<ScheduledWorkout> getInRange(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        if (to.isBefore(from)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'to' must be on or after 'from'");
        }
        if (from.plusDays(MAX_RANGE_DAYS).isBefore(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The range can be at most " + MAX_RANGE_DAYS + " days");
        }
        return calendarPlans.between(from, to);
    }

    @GetMapping("/by-date/{date}")
    public List<ScheduledWorkout> getByDate(
        @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date
    ) {
        return calendarPlans.on(date);
    }

    @PostMapping
    public ScheduledWorkout create(@RequestBody @Valid CreateScheduledWorkoutRequest body) {
        Workout workout = workoutRepository.findByIdAndUserId(body.workoutId(), CurrentUser.id())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Workout not found"));

        ScheduleStatus status = body.status() != null ? body.status() : ScheduleStatus.PLANNED;
        if (status != ScheduleStatus.COMPLETED && (scheduledWorkoutRepository
                .existsByDateAndWorkout_IdAndStatusNot(body.date(), body.workoutId(), ScheduleStatus.COMPLETED)
                || (body.repeatDate() == null && calendarPlans.hasUnsavedDay(body.workoutId(), body.date())))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This workout is already scheduled for that date");
        }

        // Saving a day a repeat rule planned: it must be one, and only once.
        if (body.repeatDate() != null) {
            if (!calendarPlans.plans(workout.getId(), body.repeatDate())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This workout doesn't repeat on that day");
            }
            if (scheduledWorkoutRepository.existsByWorkout_IdAndRepeatDate(workout.getId(), body.repeatDate())
                    || calendarPlans.isCleared(workout.getId(), body.repeatDate())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "That repeat day is already saved");
            }
        }

        ScheduledWorkout scheduled = new ScheduledWorkout();
        scheduled.setDate(body.date());
        scheduled.setRepeatDate(body.repeatDate());
        scheduled.setWorkout(workout);
        scheduled.setNotes(body.notes());
        scheduled.setStatus(status);
        if (body.sessionId() != null) {
            Session session = sessionRepository.findByIdAndUserId(body.sessionId(), CurrentUser.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Session not found"));
            scheduled.setSession(session);
        }
        return scheduledWorkoutRepository.save(scheduled);
    }

    @PatchMapping("/{id}")
    public ScheduledWorkout update(@PathVariable Long id, @RequestBody @Valid UpdateScheduledWorkoutRequest body) {
        ScheduledWorkout scheduled = scheduledWorkoutRepository.findByIdAndUserId(id, CurrentUser.id())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Scheduled workout not found"));
        // One plan (PLANNED/SKIPPED) per date and workout; COMPLETED entries
        // can repeat, one per session (a workout done twice in a day).
        LocalDate newDate = body.date() != null ? body.date() : scheduled.getDate();
        ScheduleStatus newStatus = body.status() != null ? body.status() : scheduled.getStatus();
        if (newStatus != ScheduleStatus.COMPLETED && (scheduledWorkoutRepository
                .existsByDateAndWorkout_IdAndStatusNotAndIdNot(newDate, scheduled.getWorkoutId(), ScheduleStatus.COMPLETED, id)
                || (!newDate.equals(scheduled.getDate()) && calendarPlans.hasUnsavedDay(scheduled.getWorkoutId(), newDate)))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This workout is already scheduled for that date");
        }
        scheduled.setDate(newDate);
        scheduled.setStatus(newStatus);
        if (body.notes() != null) scheduled.setNotes(body.notes());
        if (body.sessionId() != null) {
            Session session = sessionRepository.findByIdAndUserId(body.sessionId(), CurrentUser.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Session not found"));
            scheduled.setSession(session);
        }
        return scheduledWorkoutRepository.save(scheduled);
    }

    @DeleteMapping("/{id}")
    @Transactional
    public void delete(@PathVariable Long id) {
        ScheduledWorkout scheduled = scheduledWorkoutRepository.findByIdAndUserId(id, CurrentUser.id())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Scheduled workout not found"));
        calendarPlans.clearDaysOf(scheduled);
        scheduledWorkoutRepository.delete(scheduled);
    }
}
