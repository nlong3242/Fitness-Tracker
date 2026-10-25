package com.tsu2track.fitness_tracker;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ExerciseRepository extends JpaRepository<Exercise, Long> {
    List<Exercise> findByUserIdAndDeletedFalseOrderByNameAsc(Long userId);
    Optional<Exercise> findByIdAndUserId(Long id, Long userId);
}
