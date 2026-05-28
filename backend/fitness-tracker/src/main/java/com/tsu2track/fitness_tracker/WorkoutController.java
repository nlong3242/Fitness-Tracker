package com.tsu2track.fitness_tracker;

import java.util.List;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.tsu2track.fitness_tracker.dto.CreateWorkoutRequest;
import com.tsu2track.fitness_tracker.service.WorkoutService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/workouts")
public class WorkoutController {

    private final WorkoutService workoutService;

    public WorkoutController(WorkoutService workoutService) {
        this.workoutService = workoutService;
    }

    /* Wire-shape for /workouts. The plain Workout entity hides
       workoutExercises with @JsonIgnore (to avoid pulling the whole join
       graph every request), so we surface the count separately for UIs
       that need to gate "Start" on a non-empty workout. */
    public static class WorkoutSummary {
        private final Long id;
        private final String name;
        private final long exerciseCount;

        public WorkoutSummary(Long id, String name, long exerciseCount) {
            this.id = id;
            this.name = name;
            this.exerciseCount = exerciseCount;
        }

        public Long getId() { return id; }
        public String getName() { return name; }
        public long getExerciseCount() { return exerciseCount; }
    }

    @GetMapping
    public List<WorkoutSummary> getAllWorkouts() {
        return workoutService.findAllSummaries();
    }

    @PostMapping
    public WorkoutSummary createWorkout(@RequestBody @Valid CreateWorkoutRequest req) {
        return workoutService.create(req.name());
    }

    @DeleteMapping("/{id}")
    public void deleteWorkout(@PathVariable Long id) {
        workoutService.delete(id);
    }
}
