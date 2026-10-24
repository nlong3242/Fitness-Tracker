package com.tsu2track.fitness_tracker.service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.tsu2track.fitness_tracker.ExerciseRepository;
import com.tsu2track.fitness_tracker.ExerciseSet;
import com.tsu2track.fitness_tracker.ExerciseSetRepository;
import com.tsu2track.fitness_tracker.Session;
import com.tsu2track.fitness_tracker.Side;

/* An exercise's history across every workout that uses it: its PRs, and
   its finished sessions newest first, a page at a time. Unfinished
   sessions (the one in progress) never count.

   ★ (pr): a set whose weight × reps beats every earlier set of the
   exercise, so the very first session gets none. Sides of a unilateral
   exercise are compared separately, and 0 kg (bodyweight) sets compare
   by reps among themselves. */
@Service
public class ExerciseHistoryService {
    private final ExerciseRepository exerciseRepository;
    private final ExerciseSetRepository exerciseSetRepository;

    public ExerciseHistoryService(ExerciseRepository exerciseRepository,
                                  ExerciseSetRepository exerciseSetRepository) {
        this.exerciseRepository = exerciseRepository;
        this.exerciseSetRepository = exerciseSetRepository;
    }

    public record HistorySet(double weight, int reps, Side side, boolean pr) {}
    public record HistorySession(Long sessionId, LocalDate date, Long workoutId, List<HistorySet> sets) {}
    public record Record(double weight, int reps, LocalDate date) {}
    // heaviest: most weight (more reps breaks a tie). bestSet: highest
    // estimated one-rep max, weight × (1 + reps / 30). Both null until a
    // set with weight above 0 is finished. The earliest set wins a tie.
    public record Records(Record heaviest, Record bestSet) {}
    public record History(Records records, List<HistorySession> sessions, boolean hasMore) {}

    @Transactional(readOnly = true)
    public History history(Long exerciseId, int page, int size) {
        if (!exerciseRepository.existsById(exerciseId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found");
        }
        List<ExerciseSet> sets = exerciseSetRepository.findFinishedSetsOldestFirst(exerciseId);

        Map<String, Double> bestScore = new HashMap<>();
        Map<Long, HistorySession> sessions = new LinkedHashMap<>();
        Record heaviest = null;
        Record bestSet = null;
        for (ExerciseSet set : sets) {
            Session session = set.getSession();
            String key = (set.getWeight() > 0 ? "kg" : "bw") + "/" + set.getSide();
            double score = set.getWeight() > 0 ? set.getWeight() * set.getReps() : set.getReps();
            Double best = bestScore.get(key);
            boolean pr = best != null && score > best;
            if (best == null || score > best) bestScore.put(key, score);

            sessions.computeIfAbsent(session.getId(), id ->
                    new HistorySession(id, session.getDate(), session.getWorkoutId(), new ArrayList<>()))
                .sets().add(new HistorySet(set.getWeight(), set.getReps(), set.getSide(), pr));

            if (set.getWeight() <= 0) continue;
            Record here = new Record(set.getWeight(), set.getReps(), session.getDate());
            if (heaviest == null || set.getWeight() > heaviest.weight()
                    || (set.getWeight() == heaviest.weight() && set.getReps() > heaviest.reps())) {
                heaviest = here;
            }
            if (bestSet == null || oneRepMax(here) > oneRepMax(bestSet)) {
                bestSet = here;
            }
        }

        List<HistorySession> newestFirst = new ArrayList<>(sessions.values());
        Collections.reverse(newestFirst);
        int from = Math.min(page * size, newestFirst.size());
        int to = Math.min(from + size, newestFirst.size());
        return new History(new Records(heaviest, bestSet), newestFirst.subList(from, to), to < newestFirst.size());
    }

    private static double oneRepMax(Record r) {
        return r.weight() * (1 + r.reps() / 30.0);
    }
}
