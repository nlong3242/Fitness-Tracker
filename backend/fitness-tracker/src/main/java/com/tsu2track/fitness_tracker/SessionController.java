package com.tsu2track.fitness_tracker;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class SessionController {
    private final SessionRepository sessionRepository;
    private final WorkoutRepository workoutRepository;
    private final ExerciseRepository exerciseRepository;
    private final ExerciseSetRepository exerciseSetRepository;
    private final SessionExerciseRepository sessionExerciseRepository;

    public SessionController(SessionRepository sessionRepository, WorkoutRepository workoutRepository,
        ExerciseRepository exerciseRepository, ExerciseSetRepository exerciseSetRepository,
        SessionExerciseRepository sessionExerciseRepository){
        this.sessionRepository =  sessionRepository;
        this.workoutRepository = workoutRepository;
        this.exerciseRepository = exerciseRepository;
        this.exerciseSetRepository = exerciseSetRepository;
        this.sessionExerciseRepository = sessionExerciseRepository;
    }

    @GetMapping("/workouts/{workoutId}/sessions")
    public Page<Session> getSessions(
        @PathVariable Long workoutId,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "5") int size
    ) {
        return sessionRepository.findByWorkout_IdOrderByDateDescIdDesc(workoutId, PageRequest.of(page, size));
    }

    @PostMapping("/workouts/{workoutId}/sessions")
    public Session createSession(@PathVariable Long workoutId) {
        Optional<Workout> workout = workoutRepository.findById(workoutId);
        if (!workout.isPresent()) {
            return null;
        }
        Session session = new Session();
        session.setDate(LocalDate.now());
        session.setWorkout(workout.get());
        return sessionRepository.save(session);
    }

    @PostMapping("/sessions/{sessionId}/finish")
    public Session finishSession(@PathVariable Long sessionId) {
        Session session = sessionRepository.findById(sessionId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found"));
        if (session.isFinished()) {
            return session;
        }

        Long workoutId = session.getWorkoutId();
        List<Exercise> currentExercises = exerciseRepository.findByWorkout_IdAndDeletedFalse(workoutId);
        List<ExerciseSet> sessionSets = exerciseSetRepository.findBySession_Id(sessionId);

        Map<Long, Exercise> exercisesById = new LinkedHashMap<>();
        for (Exercise ex : currentExercises) {
            exercisesById.put(ex.getId(), ex);
        }
        for (ExerciseSet set : sessionSets) {
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

        session.setFinished(true);
        return sessionRepository.save(session);
    }

    @GetMapping("/sessions/{sessionId}/exercises")
    public List<SessionExercise> getSessionExercises(@PathVariable Long sessionId) {
        if (!sessionRepository.existsById(sessionId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found");
        }
        return sessionExerciseRepository.findBySession_IdOrderByPositionAsc(sessionId);
    }

    @DeleteMapping("/sessions/{sessionId}")
    public void deleteSession (@PathVariable Long sessionId){
        Optional<Session> session = sessionRepository.findById(sessionId);
        if (session.isPresent() && session.get().isFinished()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cannot delete a finished session");
        }
        sessionRepository.deleteById(sessionId);
    }

    public static class SessionTotals {
        private int exercises;
        private int sets;
        private int reps;
        private double volume;

        public int getExercises() { return exercises; }
        public int getSets() { return sets; }
        public int getReps() { return reps; }
        public double getVolume() { return volume; }

        public void setExercises(int exercises) { this.exercises = exercises; }
        public void setSets(int sets) { this.sets = sets; }
        public void setReps(int reps) { this.reps = reps; }
        public void setVolume(double volume) { this.volume = volume; }
    }

    @GetMapping("/workouts/{workoutId}/sessions/{sessionId}/previous-totals")
    public org.springframework.http.ResponseEntity<SessionTotals> getPreviousTotals(
        @PathVariable Long workoutId,
        @PathVariable Long sessionId
    ) {
        Session current = sessionRepository.findById(sessionId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found"));
        Optional<Session> previous = sessionRepository.findPreviousSession(workoutId, current.getDate(), sessionId);
        if (!previous.isPresent()) {
            return org.springframework.http.ResponseEntity.notFound().build();
        }

        List<ExerciseSet> sets = exerciseSetRepository.findBySession_Id(previous.get().getId());
        java.util.Set<Long> uniqueExercises = new java.util.HashSet<>();
        int repsTotal = 0;
        double volumeTotal = 0;
        for (ExerciseSet set : sets) {
            uniqueExercises.add(set.getExerciseId());
            repsTotal += set.getReps();
            volumeTotal += set.getWeight() * set.getReps();
        }

        SessionTotals totals = new SessionTotals();
        totals.setExercises(uniqueExercises.size());
        totals.setSets(sets.size());
        totals.setReps(repsTotal);
        totals.setVolume(volumeTotal);
        return org.springframework.http.ResponseEntity.ok(totals);
    }

}
