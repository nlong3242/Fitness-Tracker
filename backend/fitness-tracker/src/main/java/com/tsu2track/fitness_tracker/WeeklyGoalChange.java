package com.tsu2track.fitness_tracker;

import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;

// The weekly goal from weekStart on (V14); see service/WeeklyGoals.
@Entity
public class WeeklyGoalChange extends Owned {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private LocalDate weekStart;

    // Null: no goal (one workout a week).
    private Integer weeklyGoal;

    public WeeklyGoalChange() {}

    public WeeklyGoalChange(LocalDate weekStart, Integer weeklyGoal) {
        this.weekStart = weekStart;
        this.weeklyGoal = weeklyGoal;
    }

    public Long getId() { return id; }
    public LocalDate getWeekStart() { return weekStart; }
    public Integer getWeeklyGoal() { return weeklyGoal; }
    public void setWeeklyGoal(Integer weeklyGoal) { this.weeklyGoal = weeklyGoal; }
}
