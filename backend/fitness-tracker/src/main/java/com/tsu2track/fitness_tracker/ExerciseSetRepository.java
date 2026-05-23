package com.tsu2track.fitness_tracker;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ExerciseSetRepository extends JpaRepository<ExerciseSet, Long> {
    List<ExerciseSet> findByExercise_IdAndSession_Id(Long exerciseId, Long sessionId);
    List<ExerciseSet> findBySession_Id(Long sessionId);

    @Query("""
        SELECT s FROM ExerciseSet s
        WHERE s.exercise.id = :exerciseId
          AND s.session.workout.id = :workoutId
          AND s.session.id <> :excludeSessionId
          AND s.session.id = (
            SELECT s2.session.id FROM ExerciseSet s2
            WHERE s2.exercise.id = :exerciseId
              AND s2.session.workout.id = :workoutId
              AND s2.session.id <> :excludeSessionId
            ORDER BY s2.session.date DESC, s2.session.id DESC
            LIMIT 1
          )
        """)
    List<ExerciseSet> findLastSetsForExercise(
        @Param("workoutId") Long workoutId,
        @Param("exerciseId") Long exerciseId,
        @Param("excludeSessionId") Long excludeSessionId
    );
}
