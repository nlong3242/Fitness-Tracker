package com.tsu2track.fitness_tracker.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.tsu2track.fitness_tracker.ApiFieldException;
import com.tsu2track.fitness_tracker.AppUser;
import com.tsu2track.fitness_tracker.AppUserRepository;
import com.tsu2track.fitness_tracker.AuthToken;
import com.tsu2track.fitness_tracker.AuthTokenRepository;
import com.tsu2track.fitness_tracker.security.AuthUser;

/* Accounts and login tokens.
   - Sign-up needs the invite code (app.signup.invite-code); blank closes it.
     The first account takes any data from before accounts (UnownedData).
   - Logging in (or signing up) issues a random token. The client sends it
     as "Authorization: Bearer <token>"; only its SHA-256 is stored.
   - A token lapses after 90 days without use. Using it pushes that out,
     recorded at most hourly so requests don't each write to the database.
   - 5 wrong passwords for an email lock it for 15 minutes. Kept in memory:
     a restart clears it, which is fine at this scale. */
@Service
public class AuthService {
    static final Duration STAY_LOGGED_IN = Duration.ofDays(90);
    static final Duration RECORD_USE_EVERY = Duration.ofHours(1);
    static final int MAX_FAILED_LOGINS = 5;
    static final Duration LOCKOUT = Duration.ofMinutes(15);
    static final String WRONG_LOGIN = "Wrong email or password.";

    public record LoginResult(String token, AuthUser user) {}

    private record Failures(int count, LocalDateTime lockedUntil) {}

    private final AppUserRepository userRepository;
    private final AuthTokenRepository tokenRepository;
    private final UnownedData unownedData;
    private final PasswordEncoder passwordEncoder;
    private final Clock clock;
    private final byte[] inviteCode;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Failures> failures = new ConcurrentHashMap<>();
    // Compared against when the email is unknown, so a wrong email takes as
    // long as a wrong password and response times don't reveal accounts.
    private final String dummyHash;

    public AuthService(
            AppUserRepository userRepository,
            AuthTokenRepository tokenRepository,
            PasswordEncoder passwordEncoder,
            UnownedData unownedData,
            Clock clock,
            @Value("${app.signup.invite-code:}") String inviteCode) {
        this.userRepository = userRepository;
        this.tokenRepository = tokenRepository;
        this.unownedData = unownedData;
        this.passwordEncoder = passwordEncoder;
        this.clock = clock;
        this.inviteCode = inviteCode.trim().getBytes(StandardCharsets.UTF_8);
        this.dummyHash = passwordEncoder.encode("not-a-real-password");
    }

    @Transactional
    public LoginResult signup(String email, String password, String inviteCode) {
        if (this.inviteCode.length == 0) {
            throw new ApiFieldException(HttpStatus.FORBIDDEN, "inviteCode", "Sign-up is closed.");
        }
        if (!MessageDigest.isEqual(inviteCode.trim().getBytes(StandardCharsets.UTF_8), this.inviteCode)) {
            throw new ApiFieldException(HttpStatus.FORBIDDEN, "inviteCode", "Invalid invite code.");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ApiFieldException(HttpStatus.BAD_REQUEST, "password", "Password is too long.");
        }
        String normalized = normalize(email);
        if (userRepository.existsByEmail(normalized)) {
            throw new ApiFieldException(HttpStatus.CONFLICT, "email", "An account with this email already exists.");
        }
        boolean firstAccount = userRepository.count() == 0;
        AppUser user = userRepository.save(
            new AppUser(normalized, passwordEncoder.encode(password), now()));
        if (firstAccount) unownedData.claimFor(user.getId());
        return issueToken(user);
    }

    @Transactional
    public LoginResult login(String email, String password) {
        String normalized = normalize(email);
        LocalDateTime now = now();
        Failures previous = failures.get(normalized);
        if (previous != null && previous.lockedUntil() != null && now.isBefore(previous.lockedUntil())) {
            // Whole minutes left, rounded up: 15:00 → 15, 14:01 → 15, 0:20 → 1.
            long minutes = Math.max(1, (Duration.between(now, previous.lockedUntil()).toSeconds() + 59) / 60);
            throw new ApiFieldException(HttpStatus.TOO_MANY_REQUESTS, "(credentials)",
                "Too many attempts. Try again in " + minutes + " minute" + (minutes == 1 ? "" : "s") + ".");
        }

        Optional<AppUser> user = userRepository.findByEmail(normalized);
        boolean ok = passwordEncoder.matches(password, user.map(AppUser::getPasswordHash).orElse(dummyHash))
            && user.isPresent();
        if (!ok) {
            recordFailure(normalized, now);
            throw new ApiFieldException(HttpStatus.UNAUTHORIZED, "(credentials)", WRONG_LOGIN);
        }
        failures.remove(normalized);
        tokenRepository.deleteByUserIdAndLastUsedAtBefore(user.get().getId(), now.minus(STAY_LOGGED_IN));
        return issueToken(user.get());
    }

    // The token's user, or empty when it's unknown or has lapsed.
    @Transactional
    public Optional<AuthUser> authenticate(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) return Optional.empty();
        String hash = hash(rawToken);
        Optional<AuthToken> found = tokenRepository.findByTokenHash(hash);
        if (found.isEmpty()) return Optional.empty();
        AuthToken token = found.get();
        LocalDateTime now = now();
        if (token.getLastUsedAt().plus(STAY_LOGGED_IN).isBefore(now)) {
            tokenRepository.delete(token);
            return Optional.empty();
        }
        if (token.getLastUsedAt().plus(RECORD_USE_EVERY).isBefore(now)) {
            token.setLastUsedAt(now);
        }
        return userRepository.findById(token.getUserId())
            .map(u -> new AuthUser(u.getId(), u.getEmail()));
    }

    @Transactional
    public void logout(String rawToken) {
        if (rawToken != null && !rawToken.isBlank()) tokenRepository.deleteByTokenHash(hash(rawToken));
    }

    private LoginResult issueToken(AppUser user) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        tokenRepository.save(new AuthToken(user.getId(), hash(raw), now()));
        return new LoginResult(raw, new AuthUser(user.getId(), user.getEmail()));
    }

    private void recordFailure(String email, LocalDateTime now) {
        failures.compute(email, (key, prev) -> {
            int count = (prev == null || prev.lockedUntil() != null ? 0 : prev.count()) + 1;
            return count >= MAX_FAILED_LOGINS
                ? new Failures(0, now.plus(LOCKOUT))
                : new Failures(count, null);
        });
    }

    private LocalDateTime now() {
        return LocalDateTime.now(clock);
    }

    static String normalize(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    static String hash(String rawToken) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
