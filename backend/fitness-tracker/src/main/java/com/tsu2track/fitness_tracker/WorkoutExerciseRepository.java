package com.tsu2track.fitness_tracker;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WorkoutExerciseRepository extends JpaRepository<WorkoutExercise, Long> {

    @Query("""
        SELECT we FROM WorkoutExercise we
        WHERE we.workout.id = :workoutId
          AND we.exercise.deleted = false
        ORDER BY we.position ASC, we.id ASC
        """)
    List<WorkoutExercise> findLiveByWorkoutId(@Param("workoutId") Long workoutId);

    Optional<WorkoutExercise> findByWorkout_IdAndExercise_Id(Long workoutId, Long exerciseId);

    @Query("SELECT COALESCE(MAX(we.position), -1) FROM WorkoutExercise we WHERE we.workout.id = :workoutId")
    int findMaxPositionForWorkout(@Param("workoutId") Long workoutId);
}
