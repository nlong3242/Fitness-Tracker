package com.tsu2track.fitness_tracker;

import java.time.LocalDate;
import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;

// One row per account and date (V7 unique constraint); see BodyWeightService.log.
@Entity
public class BodyWeight extends Owned {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private LocalDate date;

    @Column(name = "weight_kg", nullable = false)
    private Double weightKg;

    private LocalDateTime updatedAt;

    public BodyWeight() {}

    public BodyWeight(LocalDate date, Double weightKg) {
        this.date = date;
        this.weightKg = weightKg;
    }

    @PrePersist
    @PreUpdate
    protected void touch() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public LocalDate getDate() { return date; }
    public void setDate(LocalDate date) { this.date = date; }
    public Double getWeightKg() { return weightKg; }
    public void setWeightKg(Double weightKg) { this.weightKg = weightKg; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
