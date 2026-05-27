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

@RestController
@RequestMapping("/scheduled-workouts")
public class ScheduledWorkoutController {

    private final ScheduledWorkoutRepository scheduledWorkoutRepository;
    private final WorkoutRepository workoutRepository;

    public ScheduledWorkoutController(
        ScheduledWorkoutRepository scheduledWorkoutRepository,
        WorkoutRepository workoutRepository
    ) {
        this.scheduledWorkoutRepository = scheduledWorkoutRepository;
        this.workoutRepository = workoutRepository;
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

    public static class CreateBody {
        private LocalDate date;
        private Long workoutId;
        private String notes;

        public LocalDate getDate() { return date; }
        public void setDate(LocalDate date) { this.date = date; }
        public Long getWorkoutId() { return workoutId; }
        public void setWorkoutId(Long workoutId) { this.workoutId = workoutId; }
        public String getNotes() { return notes; }
        public void setNotes(String notes) { this.notes = notes; }
    }

    @PostMapping
    public ScheduledWorkout create(@RequestBody CreateBody body) {
        if (body == null || body.getDate() == null || body.getWorkoutId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "date and workoutId are required");
        }
        Workout workout = workoutRepository.findById(body.getWorkoutId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Workout not found"));

        if (scheduledWorkoutRepository.existsByDateAndWorkout_Id(body.getDate(), body.getWorkoutId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This workout is already scheduled for that date");
        }

        ScheduledWorkout scheduled = new ScheduledWorkout();
        scheduled.setDate(body.getDate());
        scheduled.setWorkout(workout);
        scheduled.setNotes(body.getNotes());
        return scheduledWorkoutRepository.save(scheduled);
    }

    public static class PatchBody {
        private LocalDate date;
        private ScheduleStatus status;
        private String notes;

        public LocalDate getDate() { return date; }
        public void setDate(LocalDate date) { this.date = date; }
        public ScheduleStatus getStatus() { return status; }
        public void setStatus(ScheduleStatus status) { this.status = status; }
        public String getNotes() { return notes; }
        public void setNotes(String notes) { this.notes = notes; }
    }

    @PatchMapping("/{id}")
    public ScheduledWorkout update(@PathVariable Long id, @RequestBody PatchBody body) {
        ScheduledWorkout scheduled = scheduledWorkoutRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Scheduled workout not found"));
        if (body != null) {
            if (body.getDate() != null && !body.getDate().equals(scheduled.getDate())) {
                if (scheduledWorkoutRepository.existsByDateAndWorkout_IdAndIdNot(
                    body.getDate(), scheduled.getWorkoutId(), id
                )) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "This workout is already scheduled for that date");
                }
                scheduled.setDate(body.getDate());
            }
            if (body.getStatus() != null) scheduled.setStatus(body.getStatus());
            if (body.getNotes() != null) scheduled.setNotes(body.getNotes());
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
