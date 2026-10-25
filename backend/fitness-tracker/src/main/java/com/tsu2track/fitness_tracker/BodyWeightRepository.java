package com.tsu2track.fitness_tracker;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface BodyWeightRepository extends JpaRepository<BodyWeight, Long> {
    Optional<BodyWeight> findByUserIdAndDate(Long userId, LocalDate date);
    Optional<BodyWeight> findFirstByUserIdAndDateLessThanEqualOrderByDateDesc(Long userId, LocalDate date);
    long deleteByUserIdAndDate(Long userId, LocalDate date);
    List<BodyWeight> findByUserIdOrderByDateAsc(Long userId);
}
