package com.tsu2track.fitness_tracker.dto;

import com.tsu2track.fitness_tracker.ExerciseCategory;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateExerciseRequest(
    @NotBlank @Size(max = 120) String name,
    @NotNull ExerciseCategory category,
    @Size(max = 255) String primaryMuscleGroups,
    @Size(max = 255) String exerciseType,
    @Size(max = 50) String equipment,
    @Size(max = 4000) String cues,
    @Size(max = 5000) String notes,
    Boolean unilateral
) {}
