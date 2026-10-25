package com.tsu2track.fitness_tracker;

import java.time.LocalDate;
import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;

// No (date, workout) uniqueness any more (V4): repeat COMPLETED entries are
// allowed; ScheduledWorkoutController keeps one PLANNED/SKIPPED per day.
@Entity
public class ScheduledWorkout extends Owned {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private LocalDate date;

    @JsonIgnore
    @ManyToOne
    @JoinColumn(name = "workout_id")
    private Workout workout;

    @Enumerated(EnumType.STRING)
    private ScheduleStatus status = ScheduleStatus.PLANNED;

    @JsonIgnore
    @OneToOne
    @JoinColumn(name = "session_id")
    private Session session;

    private String notes;

    private LocalDateTime createdAt;

    public ScheduledWorkout() {}

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
        if (status == null) {
            status = ScheduleStatus.PLANNED;
        }
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public LocalDate getDate() { return date; }
    public void setDate(LocalDate date) { this.date = date; }

    public Workout getWorkout() { return workout; }
    public void setWorkout(Workout workout) { this.workout = workout; }

    public Long getWorkoutId() {
        return workout != null ? workout.getId() : null;
    }

    public ScheduleStatus getStatus() { return status; }
    public void setStatus(ScheduleStatus status) { this.status = status; }

    public Session getSession() { return session; }
    public void setSession(Session session) { this.session = session; }

    public Long getSessionId() {
        return session != null ? session.getId() : null;
    }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
