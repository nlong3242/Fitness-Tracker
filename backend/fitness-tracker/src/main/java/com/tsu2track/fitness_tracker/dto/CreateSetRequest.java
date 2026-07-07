package com.tsu2track.fitness_tracker.dto;

import com.tsu2track.fitness_tracker.Side;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

public record CreateSetRequest(
    @NotNull @PositiveOrZero Double weight,
    @NotNull @Min(1) Integer reps,
    Side side
) {}
