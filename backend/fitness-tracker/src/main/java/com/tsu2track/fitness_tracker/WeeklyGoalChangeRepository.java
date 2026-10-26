package com.tsu2track.fitness_tracker;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface WeeklyGoalChangeRepository extends JpaRepository<WeeklyGoalChange, Long> {
    Optional<WeeklyGoalChange> findByUserIdAndWeekStart(Long userId, LocalDate weekStart);
    List<WeeklyGoalChange> findByUserIdOrderByWeekStartAsc(Long userId);
}
