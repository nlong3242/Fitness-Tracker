package com.tsu2track.fitness_tracker.security;

// The logged-in user, as the token filter puts it in the security context.
// Controllers take it with @AuthenticationPrincipal.
public record AuthUser(Long id, String email) {}
