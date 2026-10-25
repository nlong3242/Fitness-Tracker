package com.tsu2track.fitness_tracker;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.extension.AfterEachCallback;
import org.junit.jupiter.api.extension.BeforeEachCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.junit.jupiter.SpringExtension;

import com.tsu2track.fitness_tracker.security.AuthUser;

/* Runs each test as a fresh account, the way TokenAuthFilter sets one up
   for a request: saves an AppUser and puts it in the security context, so
   new rows belong to it (Owned) and lookups are scoped to it.
   Put it after the Spring test annotation, so it runs inside the test's
   transaction: @DataJpaTest @ExtendWith(LoggedIn.class). */
public class LoggedIn implements BeforeEachCallback, AfterEachCallback {
    private static final AtomicInteger COUNT = new AtomicInteger();

    @Override
    public void beforeEach(ExtensionContext context) {
        as(newUser(SpringExtension.getApplicationContext(context).getBean(AppUserRepository.class)));
    }

    @Override
    public void afterEach(ExtensionContext context) {
        SecurityContextHolder.clearContext();
    }

    public static AppUser newUser(AppUserRepository users) {
        return users.save(new AppUser("user" + COUNT.incrementAndGet() + "@example.com", "x", LocalDateTime.now()));
    }

    // Switch who's logged in mid-test (isolation tests).
    public static void as(AppUser user) {
        as(new AuthUser(user.getId(), user.getEmail()));
    }

    public static void as(AuthUser principal) {
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(principal, null, List.of()));
    }
}
