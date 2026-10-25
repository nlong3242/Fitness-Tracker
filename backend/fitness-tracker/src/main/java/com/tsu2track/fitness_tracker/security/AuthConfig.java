package com.tsu2track.fitness_tracker.security;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class AuthConfig {

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    // AuthService reads time through this, so tests can move it forward
    // (token expiry, lockouts).
    @Bean
    Clock clock() {
        return Clock.systemDefaultZone();
    }
}
