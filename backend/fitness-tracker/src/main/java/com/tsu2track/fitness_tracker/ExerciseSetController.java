package com.tsu2track.fitness_tracker;

import java.util.List;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

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
        return exerciseSetRepository.findBySession_Id(sessionId);
    }

    @GetMapping("/workouts/{workoutId}/exercises/{exerciseId}/last-sets")
    public List<ExerciseSet> getLastSets(
        @PathVariable Long workoutId,
        @PathVariable Long exerciseId,
        @RequestParam(required = false) Long beforeSessionId
    ) {
        java.time.LocalDate beforeDate = null;
        if (beforeSessionId != null) {
            Optional<Session> anchor = sessionRepository.findById(beforeSessionId);
            if (!anchor.isPresent()) {
                return java.util.Collections.emptyList();
            }
            beforeDate = anchor.get().getDate();
        }
        return exerciseSetRepository.findLastSetsForExercise(workoutId, exerciseId, beforeSessionId, beforeDate);
    }

    
    @PostMapping("/sessions/{sessionId}/sets")
    public ExerciseSet createSet (@RequestBody ExerciseSet set, @RequestParam Long exerciseId, @PathVariable Long sessionId){
        Optional<Session> session = sessionRepository.findById(sessionId);
        Optional<Exercise> exercise = exerciseRepository.findById(exerciseId);
        boolean sessionPresent = session.isPresent();
        boolean exercisePresent = exercise.isPresent();
        if (sessionPresent && exercisePresent){
            if (session.get().isFinished()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Session is finished");
            }
            boolean isUnilateral = Boolean.TRUE.equals(exercise.get().getUnilateral());
            if (isUnilateral && set.getSide() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Side is required for unilateral exercises");
            }
            if (!isUnilateral && set.getSide() != null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Side must not be set for bilateral exercises");
            }
            set.setExercise(exercise.get());
            set.setSession(session.get());
            return exerciseSetRepository.save(set);
        }
        return null;
    }

    @PutMapping("/sets/{setId}")
    public ExerciseSet updateSet(@PathVariable Long setId, @RequestBody ExerciseSet body) {
        Optional<ExerciseSet> existing = exerciseSetRepository.findById(setId);
        if (existing.isPresent()) {
            ExerciseSet set = existing.get();
            if (set.getSession() != null && set.getSession().isFinished()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Session is finished");
            }
            set.setWeight(body.getWeight());
            set.setReps(body.getReps());
            return exerciseSetRepository.save(set);
        }
        return null;
    }

    @DeleteMapping("/sets/{setId}")
    public void deleteSet (@PathVariable Long setId) {
        Optional<ExerciseSet> existing = exerciseSetRepository.findById(setId);
        if (existing.isPresent() && existing.get().getSession() != null && existing.get().getSession().isFinished()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Session is finished");
        }
        exerciseSetRepository.deleteById(setId);
    }

}
