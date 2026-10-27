package com.tsu2track.fitness_tracker;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ScheduledWorkoutRepository extends JpaRepository<ScheduledWorkout, Long> {
    Optional<ScheduledWorkout> findByIdAndUserId(Long id, Long userId);
    List<ScheduledWorkout> findByUserIdAndDateBetweenOrderByDateAscCreatedAtAsc(Long userId, LocalDate from, LocalDate to);
    List<ScheduledWorkout> findByUserIdAndDateOrderByCreatedAtAsc(Long userId, LocalDate date);
    List<ScheduledWorkout> findByWorkout_Id(Long workoutId);
    Optional<ScheduledWorkout> findBySession_Id(Long sessionId);
    Optional<ScheduledWorkout> findFirstByUserIdAndStatusAndDateGreaterThanEqualOrderByDateAscCreatedAtAsc(Long userId, ScheduleStatus status, LocalDate from);
    long countByUserIdAndStatusAndDate(Long userId, ScheduleStatus status, LocalDate date);

    // Entries made from repeat days (V16), wherever they were moved to.
    List<ScheduledWorkout> findByUserIdAndRepeatDateBetween(Long userId, LocalDate from, LocalDate to);
    boolean existsByWorkout_IdAndRepeatDate(Long workoutId, LocalDate repeatDate);

    // Plans (PLANNED/SKIPPED) are unique per date+workout; COMPLETED rows
    // repeat. The workout is the caller's, so these need no user filter.
    boolean existsByDateAndWorkout_IdAndStatusNot(LocalDate date, Long workoutId, ScheduleStatus status);
    boolean existsByDateAndWorkout_IdAndStatusNotAndIdNot(LocalDate date, Long workoutId, ScheduleStatus status, Long id);
}
