package com.tsu2track.fitness_tracker;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
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
    public List<Session> getSessions(@PathVariable Long workoutId){
        return sessionRepository.findByWorkout_Id(workoutId);
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
