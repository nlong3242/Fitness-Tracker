package com.tsu2track.fitness_tracker.dto;

import com.tsu2track.fitness_tracker.Side;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

// Which numbers are needed depends on the exercise's LogType; SessionService
// checks that. Time is up to 999:59, what the min and sec boxes can hold.
public record CreateSetRequest(
    @PositiveOrZero Double weight,
    @Min(1) Integer reps,
    @Min(1) @Max(59999) Integer durationSeconds,
    @Positive @DecimalMax("1000") Double distanceKm,
    Side side
) {}
