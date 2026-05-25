package com.tsu2track.fitness_tracker;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class SessionSnapshotMigration implements CommandLineRunner {
    private final SessionRepository sessionRepository;
    private final SessionExerciseRepository sessionExerciseRepository;
    private final ExerciseSetRepository exerciseSetRepository;
    private final ExerciseRepository exerciseRepository;

    public SessionSnapshotMigration(SessionRepository sessionRepository,
        SessionExerciseRepository sessionExerciseRepository,
        ExerciseSetRepository exerciseSetRepository,
        ExerciseRepository exerciseRepository) {
        this.sessionRepository = sessionRepository;
        this.sessionExerciseRepository = sessionExerciseRepository;
        this.exerciseSetRepository = exerciseSetRepository;
        this.exerciseRepository = exerciseRepository;
    }

    @Override
    @Transactional
    public void run(String... args) {
        List<Session> sessions = sessionRepository.findAll();
        for (Session session : sessions) {
            if (sessionExerciseRepository.existsBySession_Id(session.getId())) {
                continue;
            }

            List<ExerciseSet> sets = exerciseSetRepository.findBySession_Id(session.getId());
            Map<Long, Exercise> exercisesById = new LinkedHashMap<>();
            for (ExerciseSet set : sets) {
                Long exId = set.getExerciseId();
                if (exId != null && !exercisesById.containsKey(exId)) {
                    Optional<Exercise> ex = exerciseRepository.findById(exId);
                    if (ex.isPresent()) {
                        exercisesById.put(exId, ex.get());
                    }
                }
            }

            int position = 0;
            for (Exercise ex : exercisesById.values()) {
                SessionExercise snapshot = new SessionExercise();
                snapshot.setSession(session);
                snapshot.setExercise(ex);
                snapshot.setPosition(position++);
                snapshot.setName(ex.getName());
                snapshot.setCategory(ex.getCategory());
                snapshot.setPrimaryMuscleGroups(ex.getPrimaryMuscleGroups());
                snapshot.setExerciseType(ex.getExerciseType());
                snapshot.setCues(ex.getCues());
                snapshot.setUnilateral(ex.getUnilateral());
                sessionExerciseRepository.save(snapshot);
            }

            if (!session.isFinished()) {
                session.setFinished(true);
                sessionRepository.save(session);
            }
        }
    }
}
