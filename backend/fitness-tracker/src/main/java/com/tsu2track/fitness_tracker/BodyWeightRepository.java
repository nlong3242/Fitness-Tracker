package com.tsu2track.fitness_tracker;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface BodyWeightRepository extends JpaRepository<BodyWeight, Long> {
    Optional<BodyWeight> findByDate(LocalDate date);
    Optional<BodyWeight> findFirstByDateLessThanEqualOrderByDateDesc(LocalDate date);
    long deleteByDate(LocalDate date);
    List<BodyWeight> findAllByOrderByDateAsc();
}
