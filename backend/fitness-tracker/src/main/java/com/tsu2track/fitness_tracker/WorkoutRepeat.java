package com.tsu2track.fitness_tracker;

import java.time.LocalDate;
import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;

/* A workout's repeating plan (V15): weekly on some days, or every N days
   from startDate. Exactly one of weekdays / everyDays is set. Edits end
   this row and start a new one, so past weeks keep their plan. */
@Entity
public class WorkoutRepeat extends Owned {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore
    @ManyToOne
    @JoinColumn(name = "workout_id", nullable = false)
    private Workout workout;

    @Column(nullable = false)
    private LocalDate startDate;

    // Last planned day, inclusive; null repeats for ever.
    private LocalDate endDate;

    // Bit 0 = Monday ... bit 6 = Sunday.
    private Integer weekdays;

    private Integer everyDays;

    private LocalDateTime createdAt;

    public WorkoutRepeat() {}

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }

    public Long getId() { return id; }

    public Workout getWorkout() { return workout; }
    public void setWorkout(Workout workout) { this.workout = workout; }

    public Long getWorkoutId() {
        return workout != null ? workout.getId() : null;
    }

    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate startDate) { this.startDate = startDate; }

    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate endDate) { this.endDate = endDate; }

    public Integer getWeekdays() { return weekdays; }
    public void setWeekdays(Integer weekdays) { this.weekdays = weekdays; }

    public Integer getEveryDays() { return everyDays; }
    public void setEveryDays(Integer everyDays) { this.everyDays = everyDays; }

    public LocalDateTime getCreatedAt() { return createdAt; }
}
