package com.tsu2track.fitness_tracker;

import java.time.LocalDate;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
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

import jakarta.validation.Valid;

@RestController
@RequestMapping("/scheduled-workouts")
public class ScheduledWorkoutController {

    private final ScheduledWorkoutRepository scheduledWorkoutRepository;
    private final WorkoutRepository workoutRepository;
    private final SessionRepository sessionRepository;

    public ScheduledWorkoutController(
        ScheduledWorkoutRepository scheduledWorkoutRepository,
        WorkoutRepository workoutRepository,
        SessionRepository sessionRepository
    ) {
        this.scheduledWorkoutRepository = scheduledWorkoutRepository;
        this.workoutRepository = workoutRepository;
        this.sessionRepository = sessionRepository;
    }

    @GetMapping
    public List<ScheduledWorkout> getInRange(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        if (to.isBefore(from)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'to' must be on or after 'from'");
        }
        return scheduledWorkoutRepository.findByDateBetweenOrderByDateAscCreatedAtAsc(from, to);
    }

    @GetMapping("/by-date/{date}")
    public List<ScheduledWorkout> getByDate(
        @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date
    ) {
        return scheduledWorkoutRepository.findByDateOrderByCreatedAtAsc(date);
    }

    @PostMapping
    public ScheduledWorkout create(@RequestBody @Valid CreateScheduledWorkoutRequest body) {
        Workout workout = workoutRepository.findById(body.workoutId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Workout not found"));

        ScheduleStatus status = body.status() != null ? body.status() : ScheduleStatus.PLANNED;
        if (status != ScheduleStatus.COMPLETED && scheduledWorkoutRepository
                .existsByDateAndWorkout_IdAndStatusNot(body.date(), body.workoutId(), ScheduleStatus.COMPLETED)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This workout is already scheduled for that date");
        }

        ScheduledWorkout scheduled = new ScheduledWorkout();
        scheduled.setDate(body.date());
        scheduled.setWorkout(workout);
        scheduled.setNotes(body.notes());
        scheduled.setStatus(status);
        if (body.sessionId() != null) {
            Session session = sessionRepository.findById(body.sessionId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Session not found"));
            scheduled.setSession(session);
        }
        return scheduledWorkoutRepository.save(scheduled);
    }

    @PatchMapping("/{id}")
    public ScheduledWorkout update(@PathVariable Long id, @RequestBody @Valid UpdateScheduledWorkoutRequest body) {
        ScheduledWorkout scheduled = scheduledWorkoutRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Scheduled workout not found"));
        // One plan (PLANNED/SKIPPED) per date and workout; COMPLETED entries
        // can repeat, one per session (a workout done twice in a day).
        LocalDate newDate = body.date() != null ? body.date() : scheduled.getDate();
        ScheduleStatus newStatus = body.status() != null ? body.status() : scheduled.getStatus();
        if (newStatus != ScheduleStatus.COMPLETED && scheduledWorkoutRepository
                .existsByDateAndWorkout_IdAndStatusNotAndIdNot(newDate, scheduled.getWorkoutId(), ScheduleStatus.COMPLETED, id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This workout is already scheduled for that date");
        }
        scheduled.setDate(newDate);
        scheduled.setStatus(newStatus);
        if (body.notes() != null) scheduled.setNotes(body.notes());
        if (body.sessionId() != null) {
            Session session = sessionRepository.findById(body.sessionId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Session not found"));
            scheduled.setSession(session);
        }
        return scheduledWorkoutRepository.save(scheduled);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        if (!scheduledWorkoutRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Scheduled workout not found");
        }
        scheduledWorkoutRepository.deleteById(id);
    }
}
