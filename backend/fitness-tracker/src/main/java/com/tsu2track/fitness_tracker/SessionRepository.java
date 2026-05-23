package com.tsu2track.fitness_tracker;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SessionRepository extends JpaRepository<Session, Long> {
    List<Session> findByWorkout_Id(Long workoutId);
    Page<Session> findByWorkout_IdOrderByDateDescIdDesc(Long workoutId, Pageable pageable);
}
