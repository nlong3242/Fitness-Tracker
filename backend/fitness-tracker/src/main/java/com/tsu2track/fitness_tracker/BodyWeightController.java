package com.tsu2track.fitness_tracker;

import java.time.LocalDate;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.tsu2track.fitness_tracker.dto.LogBodyWeightRequest;
import com.tsu2track.fitness_tracker.service.BodyWeightService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/bodyweight")
public class BodyWeightController {
    private final BodyWeightService bodyWeightService;

    public BodyWeightController(BodyWeightService bodyWeightService) {
        this.bodyWeightService = bodyWeightService;
    }

    // PUT, not POST: the date is the identity, so saving twice is idempotent.
    @PutMapping("/{date}")
    public BodyWeight log(@PathVariable LocalDate date, @Valid @RequestBody LogBodyWeightRequest body) {
        return bodyWeightService.log(date, body.weightKg());
    }

    // `today` comes from the client so "latest" follows the phone's local date.
    @GetMapping("/summary")
    public BodyWeightService.Summary summary(@RequestParam LocalDate today) {
        return bodyWeightService.summary(today);
    }

    @DeleteMapping("/{date}")
    public ResponseEntity<Void> delete(@PathVariable LocalDate date) {
        bodyWeightService.delete(date);
        return ResponseEntity.noContent().build();
    }
}
