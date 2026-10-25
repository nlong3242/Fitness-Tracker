package com.tsu2track.fitness_tracker;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

// One logged-in device (V6). Only the SHA-256 of the token is stored.
@Entity
@Table(name = "auth_token")
public class AuthToken {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "token_hash", nullable = false, unique = true)
    private String tokenHash;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "last_used_at", nullable = false)
    private LocalDateTime lastUsedAt;

    public AuthToken() {}

    public AuthToken(Long userId, String tokenHash, LocalDateTime now) {
        this.userId = userId;
        this.tokenHash = tokenHash;
        this.createdAt = now;
        this.lastUsedAt = now;
    }

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public String getTokenHash() { return tokenHash; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getLastUsedAt() { return lastUsedAt; }
    public void setLastUsedAt(LocalDateTime lastUsedAt) { this.lastUsedAt = lastUsedAt; }
}
