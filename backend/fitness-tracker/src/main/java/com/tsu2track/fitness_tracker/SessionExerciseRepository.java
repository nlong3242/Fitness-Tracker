package com.tsu2track.fitness_tracker;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SessionExerciseRepository extends JpaRepository<SessionExercise, Long> {
    List<SessionExercise> findBySession_IdOrderByPositionAsc(Long sessionId);
    boolean existsBySession_Id(Long sessionId);

    // Reset an exercise's history: it leaves these sessions' summaries.
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM SessionExercise se WHERE se.exercise.id = :exerciseId AND se.session.id IN :sessionIds")
    int deleteByExerciseInSessions(@Param("exerciseId") Long exerciseId, @Param("sessionIds") List<Long> sessionIds);

    // Reset a workout's history: these sessions' summaries go.
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM SessionExercise se WHERE se.session.id IN :sessionIds")
    int deleteInSessions(@Param("sessionIds") List<Long> sessionIds);
}
