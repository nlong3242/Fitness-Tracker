package com.tsu2track.fitness_tracker;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

// A login account (V6). Never sent to the client as-is: it holds the
// password hash. See AuthService.
@Entity
@Table(name = "app_user")
public class AppUser {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Stored lower-cased and trimmed, so it's unique however it's typed.
    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public AppUser() {}

    public AppUser(String email, String passwordHash, LocalDateTime createdAt) {
        this.email = email;
        this.passwordHash = passwordHash;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public String getEmail() { return email; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
