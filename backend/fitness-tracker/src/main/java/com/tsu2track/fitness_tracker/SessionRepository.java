package com.tsu2track.fitness_tracker;

import java.util.List;

import org.springframework.boot.data.autoconfigure.web.DataWebProperties.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SessionRepository extends JpaRepository<Session, Long> {
    List<Session> findByWorkout_Id(Long workoutId);

    List<Session> findByWorkout_IdAndIdNotOrderByDateDescIdDesc(
        Long workoutId, 
        Long excludeSessionId, 
        Pageable pageable
    ); 
}
