package com.tsu2track.fitness_tracker.service;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.tsu2track.fitness_tracker.Exercise;

import jakarta.persistence.EntityManager;

/* Notes on built-in exercises (exercise_note, V9). The exercise is shared,
   so each account's note is kept apart and put on the exercise just before
   it is sent (Exercise.getNotes). Custom exercises keep theirs on the row. */
@Component
public class ExerciseNotes {
    private final EntityManager entityManager;

    public ExerciseNotes(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    public String get(Long userId, Long exerciseId) {
        List<?> rows = entityManager.createNativeQuery(
                "select content from exercise_note where user_id = ?1 and exercise_id = ?2")
            .setParameter(1, userId)
            .setParameter(2, exerciseId)
            .getResultList();
        return rows.isEmpty() ? null : (String) rows.get(0);
    }

    // Blank or null removes the note.
    @Transactional
    public void set(Long userId, Long exerciseId, String content) {
        entityManager.createNativeQuery("delete from exercise_note where user_id = ?1 and exercise_id = ?2")
            .setParameter(1, userId)
            .setParameter(2, exerciseId)
            .executeUpdate();
        if (content == null || content.isEmpty()) return;
        entityManager.createNativeQuery("insert into exercise_note (user_id, exercise_id, content) values (?1, ?2, ?3)")
            .setParameter(1, userId)
            .setParameter(2, exerciseId)
            .setParameter(3, content)
            .executeUpdate();
    }

    // Puts this account's notes on the built-in exercises among these.
    public void show(Long userId, Collection<Exercise> exercises) {
        if (exercises.stream().noneMatch(Exercise::isBuiltIn)) return;
        Map<Long, String> notes = new HashMap<>();
        for (Object row : entityManager.createNativeQuery(
                "select exercise_id, content from exercise_note where user_id = ?1")
                .setParameter(1, userId)
                .getResultList()) {
            Object[] cols = (Object[]) row;
            notes.put(((Number) cols[0]).longValue(), (String) cols[1]);
        }
        for (Exercise exercise : exercises) {
            if (exercise.isBuiltIn()) exercise.setViewerNote(notes.get(exercise.getId()));
        }
    }

    public void show(Long userId, Exercise exercise) {
        show(userId, List.of(exercise));
    }
}
