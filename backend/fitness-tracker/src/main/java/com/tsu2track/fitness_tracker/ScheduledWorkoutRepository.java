package com.tsu2track.fitness_tracker;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ScheduledWorkoutRepository extends JpaRepository<ScheduledWorkout, Long> {
    List<ScheduledWorkout> findByDateBetweenOrderByDateAscCreatedAtAsc(LocalDate from, LocalDate to);
    List<ScheduledWorkout> findByDateOrderByCreatedAtAsc(LocalDate date);
    List<ScheduledWorkout> findByWorkout_Id(Long workoutId);

    boolean existsByDateAndWorkout_Id(LocalDate date, Long workoutId);
    boolean existsByDateAndWorkout_IdAndIdNot(LocalDate date, Long workoutId, Long id);
}
