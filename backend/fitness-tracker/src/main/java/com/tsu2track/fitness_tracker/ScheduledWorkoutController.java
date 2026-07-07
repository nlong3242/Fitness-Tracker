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

        if (scheduledWorkoutRepository.existsByDateAndWorkout_Id(body.date(), body.workoutId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This workout is already scheduled for that date");
        }

        ScheduledWorkout scheduled = new ScheduledWorkout();
        scheduled.setDate(body.date());
        scheduled.setWorkout(workout);
        scheduled.setNotes(body.notes());
        if (body.status() != null) scheduled.setStatus(body.status());
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
        if (body.date() != null && !body.date().equals(scheduled.getDate())) {
            if (scheduledWorkoutRepository.existsByDateAndWorkout_IdAndIdNot(
                body.date(), scheduled.getWorkoutId(), id
            )) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This workout is already scheduled for that date");
            }
            scheduled.setDate(body.date());
        }
        if (body.status() != null) scheduled.setStatus(body.status());
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
