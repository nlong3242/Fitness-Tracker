package com.tsu2track.fitness_tracker;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.tsu2track.fitness_tracker.dto.ProfileRequest;
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

    // PUT: one profile per account, saved whole each time.
    @PutMapping
    public UserProfile save(@Valid @RequestBody ProfileRequest body) {
        return profileService.save(body);
    }
}
