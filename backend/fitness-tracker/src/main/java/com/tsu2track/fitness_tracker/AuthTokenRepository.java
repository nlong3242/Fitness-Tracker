package com.tsu2track.fitness_tracker;

import java.time.LocalDateTime;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface AuthTokenRepository extends JpaRepository<AuthToken, Long> {
    Optional<AuthToken> findByTokenHash(String tokenHash);
    long deleteByTokenHash(String tokenHash);
    long deleteByUserIdAndLastUsedAtBefore(Long userId, LocalDateTime cutoff);
}
