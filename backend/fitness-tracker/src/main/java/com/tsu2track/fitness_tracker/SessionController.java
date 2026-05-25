package com.tsu2track.fitness_tracker;

import java.time.LocalDate;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SessionController {
    private final SessionRepository sessionRepository;
    private final WorkoutRepository workoutRepository;

    public SessionController(SessionRepository sessionRepository, WorkoutRepository workoutRepository){
        this.sessionRepository =  sessionRepository;
        this.workoutRepository = workoutRepository;
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
        boolean present = workout.isPresent();
        if (present){
            Session session = new Session();
            session.setDate(LocalDate.now());
            session.setWorkout(workout.get());
            return sessionRepository.save(session);
        }
        return null;
    }

    @DeleteMapping("/sessions/{sessionId}")
    public void deleteSession (@PathVariable Long sessionId){
        sessionRepository.deleteById(sessionId);
    }

}
