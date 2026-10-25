
package com.tsu2track.fitness_tracker;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;

@Entity
public class Session extends Owned {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private LocalDate date;

    private boolean finished = false;

    // Last time a set was logged, edited or deleted (or the session created);
    // the app auto-ends a workout that has been idle too long.
    private Instant lastActivityAt;

    @JsonIgnore
    @ManyToOne
    @JoinColumn(name="workout_id")
    private Workout workout;

    @JsonIgnore
    @OneToMany(mappedBy = "session", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ExerciseSet> sets = new ArrayList<>();

    @JsonIgnore
    @OneToMany(mappedBy = "session", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SessionExercise> sessionExercises = new ArrayList<>();

    public Session() {}
    
    public LocalDate getDate() {
        return date;
    }

    public Long getId() {
        return id;
    }

    public Workout getWorkout() {
        return workout;
    } 

    public void setDate(LocalDate date){
        this.date = date;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public void setWorkout(Workout workout){
        this.workout = workout;
    }

    public Long getWorkoutId() {
        return workout != null ? workout.getId() : null;
    }

    public boolean isFinished() {
        return finished;
    }

    public void setFinished(boolean finished) {
        this.finished = finished;
    }

    public Instant getLastActivityAt() {
        return lastActivityAt;
    }

    public void setLastActivityAt(Instant lastActivityAt) {
        this.lastActivityAt = lastActivityAt;
    }
}
