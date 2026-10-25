package com.tsu2track.fitness_tracker;

import org.springframework.data.jpa.repository.JpaRepository;

// Keyed by the account's id: findById(CurrentUser.id()) is "my profile".
public interface UserProfileRepository extends JpaRepository<UserProfile, Long> {
}
