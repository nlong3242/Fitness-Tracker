package com.tsu2track.fitness_tracker;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface RepeatDayClearedRepository extends JpaRepository<RepeatDayCleared, Long> {
    List<RepeatDayCleared> findByUserIdAndClearedDateBetween(Long userId, LocalDate from, LocalDate to);

    boolean existsByWorkout_IdAndClearedDate(Long workoutId, LocalDate clearedDate);

    List<RepeatDayCleared> findByWorkout_Id(Long workoutId);
}
