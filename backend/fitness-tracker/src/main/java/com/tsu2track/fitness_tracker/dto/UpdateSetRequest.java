package com.tsu2track.fitness_tracker.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

// As CreateSetRequest: the set's LogType decides which numbers it needs.
public record UpdateSetRequest(
    @PositiveOrZero Double weight,
    @Min(1) Integer reps,
    @Min(1) @Max(59999) Integer durationSeconds,
    @Positive @DecimalMax("1000") Double distanceKm
) {}
