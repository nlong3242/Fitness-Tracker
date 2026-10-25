package com.tsu2track.fitness_tracker;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkoutRepository extends JpaRepository<Workout, Long> {
    List<Workout> findByUserIdOrderByIdAsc(Long userId);
    Optional<Workout> findByIdAndUserId(Long id, Long userId);
}
