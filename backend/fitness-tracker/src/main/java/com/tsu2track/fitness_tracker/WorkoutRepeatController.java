package com.tsu2track.fitness_tracker;

import java.time.Clock;
import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.tsu2track.fitness_tracker.dto.RepeatRequest;
import com.tsu2track.fitness_tracker.service.WorkoutRepeats;

import jakarta.validation.Valid;

/* A workout's repeat rule. `today` is the user's date (the app sends it);
   the server's date if left out. */
@RestController
@RequestMapping("/workouts/{workoutId}/repeat")
public class WorkoutRepeatController {
    private final WorkoutRepeats workoutRepeats;
    private final Clock clock;

    public WorkoutRepeatController(WorkoutRepeats workoutRepeats, Clock clock) {
        this.workoutRepeats = workoutRepeats;
        this.clock = clock;
    }

    // 204 when the workout doesn't repeat (any more).
    @GetMapping
    public ResponseEntity<WorkoutRepeat> current(@PathVariable Long workoutId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate today) {
        return workoutRepeats.current(workoutId, orToday(today))
            .map(ResponseEntity::ok)
            .orElseGet(() -> ResponseEntity.noContent().build());
    }

    // Sets the rule, or changes it from its start date on.
    @PutMapping
    public WorkoutRepeat set(@PathVariable Long workoutId, @Valid @RequestBody RepeatRequest body,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate today) {
        return workoutRepeats.set(workoutId, body, orToday(today));
    }

    // Stop repeating from today.
    @DeleteMapping
    public void stop(@PathVariable Long workoutId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate today) {
        workoutRepeats.stop(workoutId, orToday(today));
    }

    private LocalDate orToday(LocalDate today) {
        return today != null ? today : LocalDate.now(clock);
    }
}
