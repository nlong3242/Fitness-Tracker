package com.tsu2track.fitness_tracker;

import java.time.LocalDate;
import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;

// An account's profile (V8), keyed by the account's id. See ProfileService.
@Entity
public class UserProfile {
    // The rest timer's length until one is set: 3:00.
    public static final int DEFAULT_REST_SECONDS = 180;

    @Id
    @JsonIgnore
    private Long userId;

    @Column(name = "display_name", nullable = false)
    private String name;

    private LocalDate birthDate;
    private Integer heightCm;
    private Integer weeklyGoal;

    // The rest timer's length in seconds (V18), set in Settings. Not part
    // of the profile form, so PUT /profile leaves it alone.
    private Integer restSeconds;

    @JsonIgnore
    @Column(nullable = false)
    private LocalDateTime updatedAt;

    public UserProfile() {}

    public UserProfile(Long userId) {
        this.userId = userId;
    }

    public Long getUserId() { return userId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public LocalDate getBirthDate() { return birthDate; }
    public void setBirthDate(LocalDate birthDate) { this.birthDate = birthDate; }
    public Integer getHeightCm() { return heightCm; }
    public void setHeightCm(Integer heightCm) { this.heightCm = heightCm; }
    public Integer getWeeklyGoal() { return weeklyGoal; }
    public void setWeeklyGoal(Integer weeklyGoal) { this.weeklyGoal = weeklyGoal; }
    // Never null in the JSON: the default when none was set.
    public int getRestSeconds() { return restSeconds != null ? restSeconds : DEFAULT_REST_SECONDS; }
    public void setRestSeconds(Integer restSeconds) { this.restSeconds = restSeconds; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
