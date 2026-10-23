package com.tsu2track.fitness_tracker;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SessionRepository extends JpaRepository<Session, Long> {
    List<Session> findByWorkout_Id(Long workoutId);
    Page<Session> findByWorkout_IdOrderByDateDescIdDesc(Long workoutId, Pageable pageable);
    Optional<Session> findFirstByFinishedFalseOrderByDateDescIdDesc();

    @Query("""
        SELECT s FROM Session s
        WHERE s.workout.id = :workoutId
          AND (s.date < :date OR (s.date = :date AND s.id < :sessionId))
        ORDER BY s.date DESC, s.id DESC
        LIMIT 1
        """)
    Optional<Session> findPreviousSession(
        @Param("workoutId") Long workoutId,
        @Param("date") LocalDate date,
        @Param("sessionId") Long sessionId
    );
}
