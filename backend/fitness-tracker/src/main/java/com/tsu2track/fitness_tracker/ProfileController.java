package com.tsu2track.fitness_tracker;

import java.time.LocalDate;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.tsu2track.fitness_tracker.dto.ProfileRequest;
import com.tsu2track.fitness_tracker.dto.RestSecondsRequest;
import com.tsu2track.fitness_tracker.dto.WorkoutTimerRequest;
import com.tsu2track.fitness_tracker.service.ProfileService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/profile")
public class ProfileController {
    private final ProfileService profileService;

    public ProfileController(ProfileService profileService) {
        this.profileService = profileService;
    }

    // 204 until the profile is first saved (the app then asks for it).
    @GetMapping
    public ResponseEntity<UserProfile> mine() {
        return profileService.mine()
            .map(ResponseEntity::ok)
            .orElseGet(() -> ResponseEntity.noContent().build());
    }

    // PUT: one profile per account, saved whole each time. weekStart (the
    // Monday of the user's week) dates a weekly goal change.
    @PutMapping
    public UserProfile save(@Valid @RequestBody ProfileRequest body,
                            @RequestParam(required = false) LocalDate weekStart) {
        return profileService.save(body, weekStart);
    }

    // The rest timer's length (Settings), saved on its own so the profile
    // form never has to carry it.
    @PutMapping("/rest-seconds")
    public UserProfile saveRestSeconds(@Valid @RequestBody RestSecondsRequest body) {
        return profileService.saveRestSeconds(body.seconds());
    }

    // Show the live workout's stopwatch or not (Settings); on by default.
    @PutMapping("/workout-timer")
    public UserProfile saveShowWorkoutTimer(@Valid @RequestBody WorkoutTimerRequest body) {
        return profileService.saveShowWorkoutTimer(body.show());
    }
}
