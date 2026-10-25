package com.tsu2track.fitness_tracker.dto;

import java.time.LocalDate;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Size;

// Only the name is required; ProfileService also checks the birth date
// isn't more than 120 years back. No minimum age (sign-up is invite-only).
public record ProfileRequest(
    @NotBlank(message = "Name is required.")
    @Size(max = 40, message = "Name must be 40 characters or fewer.")
    String name,

    @Past(message = "Date of birth must be in the past.")
    LocalDate birthDate,

    @Min(value = 100, message = "Height must be between 100 and 250 cm.")
    @Max(value = 250, message = "Height must be between 100 and 250 cm.")
    Integer heightCm,

    @Min(value = 1, message = "Weekly goal must be between 1 and 7.")
    @Max(value = 7, message = "Weekly goal must be between 1 and 7.")
    Integer weeklyGoal
) {}
