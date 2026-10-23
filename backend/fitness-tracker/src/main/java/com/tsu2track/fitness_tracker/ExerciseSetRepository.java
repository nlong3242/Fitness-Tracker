package com.tsu2track.fitness_tracker;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ExerciseSetRepository extends JpaRepository<ExerciseSet, Long> {
    List<ExerciseSet> findByExercise_IdAndSession_Id(Long exerciseId, Long sessionId);
    List<ExerciseSet> findBySession_Id(Long sessionId);

    // Ordered by id (= logging order): the live workout maps these onto
    // set rows by position, so the order is part of the contract.
    @Query("""
        SELECT s FROM ExerciseSet s
        WHERE s.exercise.id = :exerciseId
          AND s.session.workout.id = :workoutId
          AND (:beforeSessionId IS NULL
               OR s.session.date < :beforeDate
               OR (s.session.date = :beforeDate AND s.session.id < :beforeSessionId))
          AND s.session.id = (
            SELECT s2.session.id FROM ExerciseSet s2
            WHERE s2.exercise.id = :exerciseId
              AND s2.session.workout.id = :workoutId
              AND (:beforeSessionId IS NULL
                   OR s2.session.date < :beforeDate
                   OR (s2.session.date = :beforeDate AND s2.session.id < :beforeSessionId))
            ORDER BY s2.session.date DESC, s2.session.id DESC
            LIMIT 1
          )
        ORDER BY s.id
        """)
    List<ExerciseSet> findLastSetsForExercise(
        @Param("workoutId") Long workoutId,
        @Param("exerciseId") Long exerciseId,
        @Param("beforeSessionId") Long beforeSessionId,
        @Param("beforeDate") LocalDate beforeDate
    );
}
