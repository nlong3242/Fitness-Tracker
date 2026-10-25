package com.tsu2track.fitness_tracker;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ExerciseRepository extends JpaRepository<Exercise, Long> {
    List<Exercise> findByUserIdAndDeletedFalseOrderByNameAsc(Long userId);
    Optional<Exercise> findByIdAndUserId(Long id, Long userId);

    List<Exercise> findByBuiltInTrueAndDeletedFalseOrderByNameAsc();
    List<Exercise> findByBuiltInTrue();

    // What an account can use (add to workouts, log, look at): its own
    // exercises and the built-in ones. Changing one needs findByIdAndUserId.
    @Query("SELECT e FROM Exercise e WHERE e.id = :id AND (e.userId = :userId OR e.builtIn = true)")
    Optional<Exercise> findUsable(@Param("id") Long id, @Param("userId") Long userId);
}
