package com.tsu2track.fitness_tracker.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

// The id of the user making this request, as TokenAuthFilter put it in the
// security context. Every data lookup is scoped by it.
public final class CurrentUser {
    private CurrentUser() {}

    public static Long id() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof AuthUser user)) {
            throw new IllegalStateException("No logged-in user for this request");
        }
        return user.id();
    }
}
