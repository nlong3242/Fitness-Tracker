package com.tsu2track.fitness_tracker;

import java.util.List;
import java.util.Optional;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ExerciseSetController {
    private final ExerciseSetRepository exerciseSetRepository;
    private final ExerciseRepository exerciseRepository;
    private final SessionRepository sessionRepository;

    public ExerciseSetController (ExerciseSetRepository exerciseSetRepository, 
        ExerciseRepository exerciseRepository, SessionRepository sessionRepository){
        this.exerciseSetRepository = exerciseSetRepository;
        this.exerciseRepository = exerciseRepository;
        this.sessionRepository = sessionRepository;
    }

    @GetMapping("/sessions/{sessionId}/sets")
    public List<ExerciseSet> getSets(@PathVariable Long sessionId){
        return exerciseSetRepository.findBySessionId(sessionId);
    }

    @PostMapping("/sessions/{sessionId}/sets")
    public ExerciseSet createSet (@RequestBody ExerciseSet set, @RequestParam Long exerciseId, @PathVariable Long sessionId){
        Optional<Session> session = sessionRepository.findById(sessionId);
        Optional<Exercise> exercise = exerciseRepository.findById(exerciseId);
        boolean sessionPresent = session.isPresent();
        boolean exercisePresent = exercise.isPresent();
        if (sessionPresent && exercisePresent){
            set.setExercise(exercise.get());
            set.setSession(session.get());
            return exerciseSetRepository.save(set);
        }
        return null;
    }

    @DeleteMapping("/sets/{setId}")
    public void deleteSet (@PathVariable Long setId) {
        exerciseSetRepository.deleteById(setId);
    }

}
