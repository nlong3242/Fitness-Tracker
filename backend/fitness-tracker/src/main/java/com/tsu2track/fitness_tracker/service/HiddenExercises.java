package com.tsu2track.fitness_tracker.service;

import java.util.HashSet;
import java.util.Set;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityManager;

/* Built-in exercises an account has taken out of its list (exercise_hidden,
   V9). Deleting a shared exercise isn't possible, so "Delete" hides it for
   that account only. */
@Component
public class HiddenExercises {
    private final EntityManager entityManager;

    public HiddenExercises(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    public Set<Long> ids(Long userId) {
        Set<Long> ids = new HashSet<>();
        for (Object id : entityManager.createNativeQuery(
                "select exercise_id from exercise_hidden where user_id = ?1")
                .setParameter(1, userId)
                .getResultList()) {
            ids.add(((Number) id).longValue());
        }
        return ids;
    }

    @Transactional
    public void hide(Long userId, Long exerciseId) {
        entityManager.createNativeQuery(
                "merge into exercise_hidden (user_id, exercise_id) key (user_id, exercise_id) values (?1, ?2)")
            .setParameter(1, userId)
            .setParameter(2, exerciseId)
            .executeUpdate();
    }
}
