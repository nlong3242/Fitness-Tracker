package com.tsu2track.fitness_tracker.dto;

import jakarta.validation.constraints.NotNull;

// PUT /profile/workout-timer: show the live workout's stopwatch or not.
public record WorkoutTimerRequest(
    @NotNull(message = "Choose on or off.")
    Boolean show
) {}
