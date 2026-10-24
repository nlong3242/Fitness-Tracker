package com.tsu2track.fitness_tracker;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ScheduledWorkoutRepository extends JpaRepository<ScheduledWorkout, Long> {
    List<ScheduledWorkout> findByDateBetweenOrderByDateAscCreatedAtAsc(LocalDate from, LocalDate to);
    List<ScheduledWorkout> findByDateOrderByCreatedAtAsc(LocalDate date);
    List<ScheduledWorkout> findByWorkout_Id(Long workoutId);
    Optional<ScheduledWorkout> findBySession_Id(Long sessionId);
    Optional<ScheduledWorkout> findFirstByStatusAndDateGreaterThanEqualOrderByDateAscCreatedAtAsc(ScheduleStatus status, LocalDate from);
    long countByStatusAndDate(ScheduleStatus status, LocalDate date);

    // Plans (PLANNED/SKIPPED) are unique per date+workout; COMPLETED rows repeat.
    boolean existsByDateAndWorkout_IdAndStatusNot(LocalDate date, Long workoutId, ScheduleStatus status);
    boolean existsByDateAndWorkout_IdAndStatusNotAndIdNot(LocalDate date, Long workoutId, ScheduleStatus status, Long id);
}
