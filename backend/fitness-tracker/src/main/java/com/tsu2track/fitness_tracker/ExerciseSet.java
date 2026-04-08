package com.tsu2track.fitness_tracker;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;

@Entity
public class ExerciseSet {
    @Id
    @GeneratedValue(strategy= GenerationType.IDENTITY)
    private Long id;
    private double weight;
    private int reps;

    @JsonIgnore
    @ManyToOne
    @JoinColumn(name = "exercise_id")
    private Exercise exercise;


    public ExerciseSet() {}

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public double getWeight() {
        return weight;
    } 

    public int getReps() {
        return reps;
    }

    public void setWeight(double weight) {
        this.weight = weight;
    }

    public void setReps(int reps) {
        this.reps = reps;
    }

    public Exercise getExercise() {
        return exercise;
    }

    public void setExercise(Exercise exercise) {
        this.exercise = exercise;
    }
}
