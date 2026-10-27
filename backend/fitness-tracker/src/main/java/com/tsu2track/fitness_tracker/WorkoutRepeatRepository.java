package com.tsu2track.fitness_tracker;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WorkoutRepeatRepository extends JpaRepository<WorkoutRepeat, Long> {
    // Rules that could plan a day between from and to.
    @Query("""
        select r from WorkoutRepeat r
        where r.userId = :userId and r.startDate <= :to
          and (r.endDate is null or r.endDate >= :from)
        order by r.startDate, r.id
        """)
    List<WorkoutRepeat> findOverlapping(@Param("userId") Long userId, @Param("from") LocalDate from, @Param("to") LocalDate to);

    List<WorkoutRepeat> findByWorkout_IdOrderByStartDateAsc(Long workoutId);
}
