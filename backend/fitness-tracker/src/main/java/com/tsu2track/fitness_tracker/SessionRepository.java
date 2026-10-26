package com.tsu2track.fitness_tracker;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SessionRepository extends JpaRepository<Session, Long> {
    Optional<Session> findByIdAndUserId(Long id, Long userId);
    List<Session> findByWorkout_Id(Long workoutId);
    Page<Session> findByWorkout_IdOrderByDateDescIdDesc(Long workoutId, Pageable pageable);
    Optional<Session> findFirstByUserIdAndFinishedFalseOrderByDateDescIdDesc(Long userId);
    Optional<Session> findFirstByUserIdAndFinishedTrueOrderByDateDescIdDesc(Long userId);
    long countByUserIdAndFinishedTrueAndDateBetween(Long userId, LocalDate from, LocalDate to);

    // One date per finished session (two on a day: that date twice).
    @Query("""
        SELECT s.date FROM Session s
        WHERE s.userId = :userId AND s.finished = true AND s.date <= :until
        ORDER BY s.date DESC
        """)
    List<LocalDate> findFinishedSessionDatesUpTo(@Param("userId") Long userId, @Param("until") LocalDate until);

    // Whether the exercise is in a workout the account is still doing: in
    // that workout, or with a set logged in it (since removed from it).
    // A null userId asks about every account (built-ins are shared).
    @Query("""
        SELECT COUNT(s) > 0 FROM Session s
        WHERE (:userId IS NULL OR s.userId = :userId) AND s.finished = false
          AND (EXISTS (SELECT 1 FROM WorkoutExercise we
                       WHERE we.workout = s.workout AND we.exercise.id = :exerciseId)
               OR EXISTS (SELECT 1 FROM ExerciseSet es
                          WHERE es.session = s AND es.exercise.id = :exerciseId))
        """)
    boolean existsOpenSessionWith(@Param("userId") Long userId, @Param("exerciseId") Long exerciseId);

    @Query("""
        SELECT s FROM Session s
        WHERE s.workout.id = :workoutId
          AND (s.date < :date OR (s.date = :date AND s.id < :sessionId))
        ORDER BY s.date DESC, s.id DESC
        LIMIT 1
        """)
    Optional<Session> findPreviousSession(
        @Param("workoutId") Long workoutId,
        @Param("date") LocalDate date,
        @Param("sessionId") Long sessionId
    );
}
