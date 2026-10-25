package com.tsu2track.fitness_tracker;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

import com.tsu2track.fitness_tracker.security.AuthUser;
import com.tsu2track.fitness_tracker.service.AuthService;

/* For @WebMvcTest slices that run the real security chain: a stand-in
   AuthService for the token filter that accepts exactly one token.
   Usage: @Import({ SecurityConfig.class, TestAuth.class }) and send
   header("Authorization", TestAuth.BEARER). */
@TestConfiguration
public class TestAuth {
    public static final String INVITE_CODE = "test-invite";  // src/test/resources/config
    public static final String TOKEN = "test-token";
    public static final String BEARER = "Bearer " + TOKEN;
    public static final AuthUser USER = new AuthUser(1L, "tester@example.com");

    @Bean
    AuthService authService() {
        AuthService authService = mock(AuthService.class);
        when(authService.authenticate(any())).thenReturn(Optional.empty());
        when(authService.authenticate(TOKEN)).thenReturn(Optional.of(USER));
        return authService;
    }
}
