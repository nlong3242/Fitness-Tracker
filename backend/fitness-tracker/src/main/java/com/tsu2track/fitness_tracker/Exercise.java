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
import jakarta.persistence.OneToMany;
import jakarta.persistence.Transient;

@Entity
public class Exercise extends Owned {
    @Id
    @GeneratedValue(strategy= GenerationType.IDENTITY)
    private Long id;
    private String name;

    @Enumerated(EnumType.STRING)
    private ExerciseCategory category;

    private String primaryMuscleGroups;
    private String exerciseType;

    @Column(length = 4000)
    private String cues;

    @Column(length = 5000)
    private String notes;

    private Boolean unilateral;

    private boolean deleted = false;

    /* Built-in (V9): shared by every account, read-only, no owner. Loaded
       from the dataset by BuiltInExercises; sourceId is the dataset's id. */
    private boolean builtIn = false;

    @JsonIgnore
    private String sourceId;

    private String equipment;
    private String level;

    // A built-in exercise's note is the viewer's own (exercise_note), put
    // here by ExerciseNotes before the exercise is sent.
    @Transient
    @JsonIgnore
    private String viewerNote;

    @JsonIgnore
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
        return builtIn ? viewerNote : notes;
    }

    public void setViewerNote(String viewerNote) {
        this.viewerNote = viewerNote;
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

    public boolean isBuiltIn() { return builtIn; }
    public void setBuiltIn(boolean builtIn) { this.builtIn = builtIn; }
    public String getSourceId() { return sourceId; }
    public void setSourceId(String sourceId) { this.sourceId = sourceId; }
    public String getEquipment() { return equipment; }
    public void setEquipment(String equipment) { this.equipment = equipment; }
    public String getLevel() { return level; }
    public void setLevel(String level) { this.level = level; }

    // Built-ins belong to no account (Owned).
    @Override
    protected boolean isShared() {
        return builtIn;
    }
}
