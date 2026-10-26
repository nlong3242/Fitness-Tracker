package com.tsu2track.fitness_tracker.service;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Objects;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.tsu2track.fitness_tracker.ApiFieldException;
import com.tsu2track.fitness_tracker.UserProfile;
import com.tsu2track.fitness_tracker.UserProfileRepository;
import com.tsu2track.fitness_tracker.dto.ProfileRequest;
import com.tsu2track.fitness_tracker.security.CurrentUser;

/* The logged-in account's profile. None until it's first saved: the app
   shows the set-up page until then. Saving replaces every field, so a
   field left blank is cleared. A new weekly goal is also recorded for
   the week it's set in (WeeklyGoals), so past weeks keep theirs. */
@Service
public class ProfileService {
    static final int MAX_AGE_YEARS = 120;

    private final UserProfileRepository profileRepository;
    private final WeeklyGoals weeklyGoals;
    private final Clock clock;

    public ProfileService(UserProfileRepository profileRepository, WeeklyGoals weeklyGoals, Clock clock) {
        this.profileRepository = profileRepository;
        this.weeklyGoals = weeklyGoals;
        this.clock = clock;
    }

    public Optional<UserProfile> mine() {
        return profileRepository.findById(CurrentUser.id());
    }

    // weekStart: the Monday of the user's current week (their calendar, as
    // the home page sends it); the server's own week if not given.
    @Transactional
    public UserProfile save(ProfileRequest req, LocalDate weekStart) {
        LocalDate today = LocalDate.now(clock);
        if (req.birthDate() != null && req.birthDate().isBefore(today.minusYears(MAX_AGE_YEARS))) {
            throw new ApiFieldException(HttpStatus.BAD_REQUEST, "birthDate", "Date of birth is too far in the past.");
        }
        Long userId = CurrentUser.id();
        UserProfile profile = profileRepository.findById(userId).orElseGet(() -> new UserProfile(userId));
        if (!Objects.equals(profile.getWeeklyGoal(), req.weeklyGoal())) {
            weeklyGoals.record(weekStart != null ? weekStart : today.with(DayOfWeek.MONDAY), req.weeklyGoal());
        }
        profile.setName(req.name().trim());
        profile.setBirthDate(req.birthDate());
        profile.setHeightCm(req.heightCm());
        profile.setWeeklyGoal(req.weeklyGoal());
        profile.setUpdatedAt(LocalDateTime.now(clock));
        return profileRepository.save(profile);
    }
}
