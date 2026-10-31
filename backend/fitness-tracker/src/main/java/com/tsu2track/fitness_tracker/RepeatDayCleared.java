package com.tsu2track.fitness_tracker;

import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;

/* A repeat day whose calendar entry was deleted (V17). Keeps the day gone:
   deleting an entry works like any other, and the rule doesn't plan it again. */
@Entity
public class RepeatDayCleared extends Owned {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "workout_id", nullable = false)
    private Workout workout;

    @Column(nullable = false)
    private LocalDate clearedDate;

    public RepeatDayCleared() {}

    public RepeatDayCleared(Workout workout, LocalDate clearedDate) {
        this.workout = workout;
        this.clearedDate = clearedDate;
    }

    public Long getId() { return id; }

    public Long getWorkoutId() {
        return workout != null ? workout.getId() : null;
    }

    public LocalDate getClearedDate() { return clearedDate; }
}
