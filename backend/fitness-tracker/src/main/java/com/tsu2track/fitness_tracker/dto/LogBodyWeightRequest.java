package com.tsu2track.fitness_tracker.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record LogBodyWeightRequest(
    @NotNull @Positive Double weightKg
) {}
