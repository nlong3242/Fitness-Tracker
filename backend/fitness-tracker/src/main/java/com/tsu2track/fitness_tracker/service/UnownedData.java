package com.tsu2track.fitness_tracker.service;

import java.util.List;

import org.springframework.stereotype.Component;

import jakarta.persistence.EntityManager;

/* Rows from before accounts that no one owns yet (V7 gives them to the
   first existing account; with none, they wait here). The first account
   to sign up takes them all. */
@Component
public class UnownedData {
    private static final List<String> TABLES =
        List.of("exercise", "workout", "session", "scheduled_workout", "body_weight");

    private final EntityManager entityManager;

    public UnownedData(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    public void claimFor(Long userId) {
        for (String table : TABLES) {
            // Built-in exercises have no owner on purpose: never claim them.
            String shared = table.equals("exercise") ? " and built_in = false" : "";
            entityManager.createNativeQuery("update " + table + " set user_id = ?1 where user_id is null" + shared)
                .setParameter(1, userId)
                .executeUpdate();
        }
    }
}
