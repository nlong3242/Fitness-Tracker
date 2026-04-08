package com.tsu2track.fitness_tracker;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ExerciseSetRepository extends JpaRepository<ExerciseSet, Long> {
    List<ExerciseSet> findByExerciseIdAndSessionId(Long exerciseId, Long sessionId);
    List<ExerciseSet> findBySessionId(Long sessionId);
}
