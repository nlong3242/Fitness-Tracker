package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.tsu2track.fitness_tracker.service.AuthService;
import com.tsu2track.fitness_tracker.service.UnownedData;

import jakarta.persistence.EntityManager;

/* Accounts and tokens: sign-up rules, login and lockout, token expiry.
   Time comes from a clock the tests move forward. */
@DataJpaTest
@Import({ AuthService.class, UnownedData.class, AuthServiceTest.Config.class })
class AuthServiceTest {

    private static final String PASSWORD = "correct horse";

    @Autowired AuthService auth;
    @Autowired AppUserRepository userRepository;
    @Autowired AuthTokenRepository tokenRepository;
    @Autowired UnownedData unownedData;
    @Autowired EntityManager entityManager;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired MovableClock clock;

    @Test
    void signupLogsInAndTheTokenIdentifiesTheUser() {
        var result = auth.signup("  Long@Example.COM ", PASSWORD, TestAuth.INVITE_CODE);

        assertThat(result.user().email()).isEqualTo("long@example.com");
        assertThat(auth.authenticate(result.token())).contains(result.user());
    }

    @Test
    void loginIgnoresEmailCaseAndSpaces() {
        auth.signup("long@example.com", PASSWORD, TestAuth.INVITE_CODE);

        var result = auth.login(" LONG@example.com ", PASSWORD);

        assertThat(auth.authenticate(result.token()).map(u -> u.email())).contains("long@example.com");
    }

    @Test
    void theFirstAccountTakesTheDataFromBeforeAccounts() {
        entityManager.createNativeQuery("insert into workout (name) values ('Upper')").executeUpdate();
        entityManager.createNativeQuery("insert into body_weight (date, weight_kg) values (date '2026-03-02', 80)")
            .executeUpdate();

        Long first = auth.signup("long@example.com", PASSWORD, TestAuth.INVITE_CODE).user().id();

        assertThat(ownerOf("workout")).isEqualTo(first);
        assertThat(ownerOf("body_weight")).isEqualTo(first);
    }

    @Test
    void laterAccountsStartEmpty() {
        auth.signup("long@example.com", PASSWORD, TestAuth.INVITE_CODE);
        entityManager.createNativeQuery("insert into workout (name) values ('Upper')").executeUpdate();

        auth.signup("friend@example.com", PASSWORD, TestAuth.INVITE_CODE);

        assertThat(ownerOf("workout")).isNull();
    }

    @Test
    void storesOnlyHashes() {
        var result = auth.signup("long@example.com", PASSWORD, TestAuth.INVITE_CODE);

        AppUser user = userRepository.findByEmail("long@example.com").orElseThrow();
        assertThat(user.getPasswordHash()).isNotEqualTo(PASSWORD).startsWith("$2");
        assertThat(tokenRepository.findAll()).singleElement()
            .satisfies(t -> assertThat(t.getTokenHash()).isNotEqualTo(result.token()).hasSize(64));
    }

    @Test
    void signupNeedsTheInviteCode() {
        assertRejected(() -> auth.signup("long@example.com", PASSWORD, "guess"),
            HttpStatus.FORBIDDEN, "inviteCode");
        assertThat(userRepository.count()).isZero();
    }

    @Test
    void signupIsClosedWithoutAnInviteCodeConfigured() {
        var closed = new AuthService(userRepository, tokenRepository, passwordEncoder, unownedData, clock, "  ");

        assertRejected(() -> closed.signup("long@example.com", PASSWORD, ""), HttpStatus.FORBIDDEN, "inviteCode");
    }

    @Test
    void oneAccountPerEmailWhateverTheCase() {
        auth.signup("long@example.com", PASSWORD, TestAuth.INVITE_CODE);

        assertRejected(() -> auth.signup("LONG@example.com", "another password", TestAuth.INVITE_CODE),
            HttpStatus.CONFLICT, "email");
        assertThat(rejection(() -> auth.signup("long@example.com", "another password", TestAuth.INVITE_CODE))
            .getMessage()).isEqualTo("An account with this email already exists.");
    }

    @Test
    void passwordOverBcryptsLimitInBytesIsRejected() {
        String fortyAccents = "é".repeat(40);   // 40 characters, 80 bytes

        assertRejected(() -> auth.signup("long@example.com", fortyAccents, TestAuth.INVITE_CODE),
            HttpStatus.BAD_REQUEST, "password");
    }

    @Test
    void wrongPasswordAndUnknownEmailGetTheSameAnswer() {
        auth.signup("long@example.com", PASSWORD, TestAuth.INVITE_CODE);

        var wrongPassword = rejection(() -> auth.login("long@example.com", "nope nope"));
        var unknownEmail = rejection(() -> auth.login("someone@example.com", PASSWORD));

        assertThat(wrongPassword.getStatus()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(unknownEmail.getStatus()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(wrongPassword.getMessage()).isEqualTo(unknownEmail.getMessage());
    }

    @Test
    void fiveWrongPasswordsLockTheEmailForFifteenMinutes() {
        auth.signup("long@example.com", PASSWORD, TestAuth.INVITE_CODE);
        for (int i = 0; i < 5; i++) rejection(() -> auth.login("long@example.com", "nope nope"));

        // Locked even with the right password.
        assertRejected(() -> auth.login("long@example.com", PASSWORD), HttpStatus.TOO_MANY_REQUESTS, "(credentials)");
        assertThat(rejection(() -> auth.login("long@example.com", PASSWORD)).getMessage())
            .isEqualTo("Too many attempts. Try again in 15 minutes.");

        clock.advance(Duration.ofMinutes(14));
        assertThat(rejection(() -> auth.login("long@example.com", PASSWORD)).getMessage())
            .isEqualTo("Too many attempts. Try again in 1 minute.");

        clock.advance(Duration.ofMinutes(2));
        assertThat(auth.login("long@example.com", PASSWORD).token()).isNotBlank();
    }

    @Test
    void aSuccessfulLoginClearsEarlierFailures() {
        auth.signup("long@example.com", PASSWORD, TestAuth.INVITE_CODE);
        for (int i = 0; i < 4; i++) rejection(() -> auth.login("long@example.com", "nope nope"));
        auth.login("long@example.com", PASSWORD);
        for (int i = 0; i < 4; i++) rejection(() -> auth.login("long@example.com", "nope nope"));

        assertThat(auth.login("long@example.com", PASSWORD).token()).isNotBlank();
    }

    @Test
    void tokenLapsesAfterNinetyDaysUnused() {
        String token = auth.signup("long@example.com", PASSWORD, TestAuth.INVITE_CODE).token();

        clock.advance(Duration.ofDays(91));

        assertThat(auth.authenticate(token)).isEmpty();
        assertThat(tokenRepository.count()).isZero();
    }

    @Test
    void usingTheTokenKeepsItAlive() {
        String token = auth.signup("long@example.com", PASSWORD, TestAuth.INVITE_CODE).token();

        clock.advance(Duration.ofDays(80));
        assertThat(auth.authenticate(token)).isPresent();
        clock.advance(Duration.ofDays(80));   // 160 days old, 80 since last use

        assertThat(auth.authenticate(token)).isPresent();
    }

    @Test
    void useIsRecordedAtMostHourly() {
        String token = auth.signup("long@example.com", PASSWORD, TestAuth.INVITE_CODE).token();
        var issued = tokenRepository.findAll().get(0).getLastUsedAt();

        clock.advance(Duration.ofMinutes(30));
        auth.authenticate(token);
        assertThat(tokenRepository.findAll().get(0).getLastUsedAt()).isEqualTo(issued);

        clock.advance(Duration.ofMinutes(31));
        auth.authenticate(token);
        assertThat(tokenRepository.findAll().get(0).getLastUsedAt()).isEqualTo(issued.plusMinutes(61));
    }

    @Test
    void logoutEndsOnlyThatDevicesLogin() {
        String phone = auth.signup("long@example.com", PASSWORD, TestAuth.INVITE_CODE).token();
        String laptop = auth.login("long@example.com", PASSWORD).token();

        auth.logout(phone);

        assertThat(auth.authenticate(phone)).isEmpty();
        assertThat(auth.authenticate(laptop)).isPresent();
    }

    @Test
    void unknownOrMissingTokensAreRejected() {
        assertThat(auth.authenticate("made-up")).isEmpty();
        assertThat(auth.authenticate("")).isEmpty();
        assertThat(auth.authenticate(null)).isEmpty();
    }

    private Long ownerOf(String table) {
        Object id = entityManager.createNativeQuery("select user_id from " + table).getSingleResult();
        return id == null ? null : ((Number) id).longValue();
    }

    private static ApiFieldException rejection(Runnable call) {
        try {
            call.run();
        } catch (ApiFieldException e) {
            return e;
        }
        throw new AssertionError("expected the call to be rejected");
    }

    private static void assertRejected(Runnable call, HttpStatus status, String field) {
        assertThatThrownBy(call::run)
            .isInstanceOfSatisfying(ApiFieldException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(status);
                assertThat(e.getField()).isEqualTo(field);
            });
    }

    static class MovableClock extends Clock {
        private Instant now = Instant.parse("2026-03-02T09:00:00Z");

        void advance(Duration d) { now = now.plus(d); }

        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    @TestConfiguration
    static class Config {
        @Bean MovableClock clock() { return new MovableClock(); }
        // Lowest BCrypt cost: same behaviour, much faster tests.
        @Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(4); }
    }
}
