package com.tsu2track.fitness_tracker;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.tsu2track.fitness_tracker.dto.LoginRequest;
import com.tsu2track.fitness_tracker.dto.SignupRequest;
import com.tsu2track.fitness_tracker.security.AuthUser;
import com.tsu2track.fitness_tracker.security.TokenAuthFilter;
import com.tsu2track.fitness_tracker.service.AuthService;

import jakarta.validation.Valid;

// signup and login are the only endpoints open without a token (SecurityConfig).
@RestController
@RequestMapping("/auth")
public class AuthController {
    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/signup")
    public ResponseEntity<AuthService.LoginResult> signup(@Valid @RequestBody SignupRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(authService.signup(body.email(), body.password(), body.inviteCode()));
    }

    @PostMapping("/login")
    public AuthService.LoginResult login(@Valid @RequestBody LoginRequest body) {
        return authService.login(body.email(), body.password());
    }

    // Ends this device's login only.
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        authService.logout(TokenAuthFilter.bearerToken(authorization));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public AuthUser me(@AuthenticationPrincipal AuthUser user) {
        return user;
    }
}
