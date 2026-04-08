package com.tsu2track.fitness_tracker;

import java.time.LocalDate;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;

@Entity
public class Session {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private LocalDate date;

    @JsonIgnore
    @ManyToOne
    @JoinColumn(name="workout_id")
    private Workout workout;

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
}
