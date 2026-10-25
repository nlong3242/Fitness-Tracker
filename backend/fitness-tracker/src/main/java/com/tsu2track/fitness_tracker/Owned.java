package com.tsu2track.fitness_tracker;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.tsu2track.fitness_tracker.security.CurrentUser;

import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PrePersist;

/* A row that belongs to one account (V7). New rows take the logged-in
   user; every lookup filters on user_id, so another account's id reads
   as "not found". Child rows (sets, workout links, session snapshots)
   belong to whoever owns their parent. */
@MappedSuperclass
public abstract class Owned {
    @JsonIgnore
    @Column(name = "user_id")
    private Long userId;

    @PrePersist
    protected void assignOwner() {
        if (userId == null && !isShared()) userId = CurrentUser.id();
    }

    // A row shared by every account (a built-in exercise) has no owner.
    protected boolean isShared() {
        return false;
    }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
}
