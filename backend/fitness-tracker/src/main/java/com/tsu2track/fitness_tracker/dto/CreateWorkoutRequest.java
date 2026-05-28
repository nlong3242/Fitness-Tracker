package com.tsu2track.fitness_tracker.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateWorkoutRequest(
    @NotBlank @Size(max = 120) String name
) {}
