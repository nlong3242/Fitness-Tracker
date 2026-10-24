package com.tsu2track.fitness_tracker.service;

import java.time.LocalDate;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.tsu2track.fitness_tracker.BodyWeight;
import com.tsu2track.fitness_tracker.BodyWeightRepository;

@Service
public class BodyWeightService {
    private final BodyWeightRepository bodyWeightRepository;

    public BodyWeightService(BodyWeightRepository bodyWeightRepository) {
        this.bodyWeightRepository = bodyWeightRepository;
    }

    // Latest weigh-in on or before `today`, plus the change since the last
    // weigh-in at least a week before it. weekChange is null until there's
    // one that old; latest is null when nothing is logged.
    public record Summary(BodyWeight latest, Double weekChange) {}

    // One weigh-in per day: logging a date again replaces its weight.
    // Stored to one decimal place, like the scale shows it.
    @Transactional
    public BodyWeight log(LocalDate date, double weightKg) {
        BodyWeight entry = bodyWeightRepository.findByDate(date)
            .orElseGet(() -> new BodyWeight(date, null));
        entry.setWeightKg(roundToTenth(weightKg));
        return bodyWeightRepository.save(entry);
    }

    public Summary summary(LocalDate today) {
        Optional<BodyWeight> latest = bodyWeightRepository.findFirstByDateLessThanEqualOrderByDateDesc(today);
        if (latest.isEmpty()) return new Summary(null, null);
        Double weekChange = bodyWeightRepository
            .findFirstByDateLessThanEqualOrderByDateDesc(latest.get().getDate().minusDays(7))
            .map(before -> roundToTenth(latest.get().getWeightKg() - before.getWeightKg()))
            .orElse(null);
        return new Summary(latest.get(), weekChange);
    }

    @Transactional
    public void delete(LocalDate date) {
        if (bodyWeightRepository.deleteByDate(date) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No weigh-in on " + date);
        }
    }

    private static double roundToTenth(double kg) {
        return Math.round(kg * 10) / 10.0;
    }
}
