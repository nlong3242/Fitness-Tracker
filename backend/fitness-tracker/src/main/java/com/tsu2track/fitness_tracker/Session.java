
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

    // The workout stopwatch (V19): when Start was tapped (sent by the app,
    // before the first set made this session) and when it was finished.
    // Null on sessions from before V19.
    private Instant startedAt;
    private Instant finishedAt;

    // The calendar plan it was started from (V20), so Finish ticks off that
    // plan even after a resume elsewhere. Null: started on its own.
    private Long scheduledWorkoutId;

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

    public Long getScheduledWorkoutId() { return scheduledWorkoutId; }
    public void setScheduledWorkoutId(Long scheduledWorkoutId) { this.scheduledWorkoutId = scheduledWorkoutId; }

    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }
    public Instant getFinishedAt() { return finishedAt; }
    public void setFinishedAt(Instant finishedAt) { this.finishedAt = finishedAt; }

    // The workout's time in whole seconds, once finished; null without
    // both times (unfinished, or from before V19).
    public Long getDurationSeconds() {
        if (startedAt == null || finishedAt == null) return null;
        return Math.max(0, finishedAt.getEpochSecond() - startedAt.getEpochSecond());
    }
}
