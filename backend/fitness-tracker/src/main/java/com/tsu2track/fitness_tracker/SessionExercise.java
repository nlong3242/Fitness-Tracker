package com.tsu2track.fitness_tracker;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;

@Entity
public class SessionExercise {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore
    @ManyToOne
    @JoinColumn(name = "session_id")
    private Session session;

    @JsonIgnore
    @ManyToOne
    @JoinColumn(name = "exercise_id")
    private Exercise exercise;

    private int position;

    private String name;

    @Enumerated(EnumType.STRING)
    private ExerciseCategory category;

    private String primaryMuscleGroups;
    private String exerciseType;

    @Column(length = 4000)
    private String cues;

    private Boolean unilateral;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    private LogType logType = LogType.WEIGHT_REPS;

    public SessionExercise() {}

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Session getSession() {
        return session;
    }

    public void setSession(Session session) {
        this.session = session;
    }

    public Exercise getExercise() {
        return exercise;
    }

    public void setExercise(Exercise exercise) {
        this.exercise = exercise;
    }

    public Long getExerciseId() {
        return exercise != null ? exercise.getId() : null;
    }

    public Long getSessionId() {
        return session != null ? session.getId() : null;
    }

    public int getPosition() {
        return position;
    }

    public void setPosition(int position) {
        this.position = position;
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

    public Boolean getUnilateral() {
        return unilateral;
    }

    public void setUnilateral(Boolean unilateral) {
        this.unilateral = unilateral;
    }

    public LogType getLogType() {
        return logType;
    }

    public void setLogType(LogType logType) {
        this.logType = logType;
    }

    public String getNotes() {
        return exercise != null ? exercise.getNotes() : null;
    }
}
