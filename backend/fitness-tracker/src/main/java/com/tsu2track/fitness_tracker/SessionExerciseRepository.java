package com.tsu2track.fitness_tracker;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SessionExerciseRepository extends JpaRepository<SessionExercise, Long> {
    List<SessionExercise> findBySession_IdOrderByPositionAsc(Long sessionId);
    boolean existsBySession_Id(Long sessionId);
}
