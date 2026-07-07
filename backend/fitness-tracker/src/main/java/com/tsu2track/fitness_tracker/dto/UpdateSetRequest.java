package com.tsu2track.fitness_tracker.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

public record UpdateSetRequest(
    @NotNull @PositiveOrZero Double weight,
    @NotNull @Min(1) Integer reps
) {}
