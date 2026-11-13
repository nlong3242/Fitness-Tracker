package com.tsu2track.fitness_tracker.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

// PUT /profile/rest-seconds: the rest timer's length, 0:15 to 10:00.
public record RestSecondsRequest(
    @NotNull(message = "Rest time is required.")
    @Min(value = 15, message = "Rest time must be between 0:15 and 10:00.")
    @Max(value = 600, message = "Rest time must be between 0:15 and 10:00.")
    Integer seconds
) {}
