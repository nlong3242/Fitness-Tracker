package com.tsu2track.fitness_tracker;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;

@Entity
public class Exercise {
    @Id
    @GeneratedValue(strategy= GenerationType.IDENTITY)
    private Long id;
    private String name;

    @Enumerated(EnumType.STRING)
    private ExerciseCategory category;

    private String primaryMuscleGroups;
    private String exerciseType;

    @Column(length = 1000)
    private String cues;

    @Column(length = 5000)
    private String notes;

    private Boolean unilateral;

    private boolean deleted = false;

    @JsonIgnore
    @ManyToOne
    @JoinColumn(name = "workout_id")
    private Workout workout;

    @OneToMany(mappedBy="exercise", cascade = CascadeType.ALL)
    private List<ExerciseSet> sets = new ArrayList<ExerciseSet>();

    public Exercise() {}

    public Exercise(String name) {
        this.name = name;
    }

    public Long getId(){
        return id;
    }

    public void setId(Long id){
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public ExerciseCategory getCategory() {
        return category;
    }

    public void setCategory(ExerciseCategory category) {
        this.category = category;
    }

    public String getPrimaryMuscleGroups() {
        return primaryMuscleGroups;
    }

    public void setPrimaryMuscleGroups(String primaryMuscleGroups) {
        this.primaryMuscleGroups = primaryMuscleGroups;
    }

    public String getExerciseType() {
        return exerciseType;
    }

    public void setExerciseType(String exerciseType) {
        this.exerciseType = exerciseType;
    }

    public String getCues() {
        return cues;
    }

    public void setCues(String cues) {
        this.cues = cues;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public Boolean getUnilateral() {
        return unilateral;
    }

    public void setUnilateral(Boolean unilateral) {
        this.unilateral = unilateral;
    }

    public boolean isDeleted() {
        return deleted;
    }

    public void setDeleted(boolean deleted) {
        this.deleted = deleted;
    }

    public Workout getWorkout() {
        return workout;
    }

    public void setWorkout(Workout workout) {
        this.workout = workout;
    }
}
