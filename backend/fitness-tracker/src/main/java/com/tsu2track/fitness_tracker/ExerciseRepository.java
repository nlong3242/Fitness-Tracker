package com.tsu2track.fitness_tracker;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ExerciseRepository extends JpaRepository<Exercise, Long> {
    List<Exercise> findByWorkoutId(Long workoutId);
}