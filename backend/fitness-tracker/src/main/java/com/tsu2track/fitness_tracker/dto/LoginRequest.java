package com.tsu2track.fitness_tracker.dto;

import jakarta.validation.constraints.NotBlank;

// No length rules here: a login attempt shouldn't reveal the password policy.
public record LoginRequest(
    @NotBlank String email,
    @NotBlank String password
) {}
