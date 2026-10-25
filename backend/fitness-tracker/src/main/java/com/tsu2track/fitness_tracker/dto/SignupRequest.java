package com.tsu2track.fitness_tracker.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// The 72-byte password limit is BCrypt's; AuthService also checks it in
// bytes, since non-ASCII characters take more than one.
// @Email alone accepts "name@gmail" (valid, but almost always a typo), so
// the domain must also contain a dot. login.js applies the same rule.
public record SignupRequest(
    @NotBlank
    @Email(regexp = "[^@\\s]+@[^@\\s]+\\.[^@\\s]+", message = "Invalid email format.")
    @Size(max = 254)
    String email,
    @NotBlank @Size(min = 8, max = 72) String password,
    @NotBlank String inviteCode
) {}
