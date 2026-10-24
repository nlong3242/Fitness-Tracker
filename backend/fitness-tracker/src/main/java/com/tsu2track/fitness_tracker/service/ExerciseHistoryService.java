package com.tsu2track.fitness_tracker.service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

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

   ★ (pr): the set shown as the Best set, so the star always matches the
   Best set card: one star, or one per side (bestLeft / bestRight) for a
   unilateral exercise. None while there's no set above 0 kg (no Best
   set either). */
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
    // heaviest: most weight on any side (more reps breaks a tie).
    // bestSet: highest estimated one-rep max, weight × (1 + reps / 30),
    // among two-sided sets; bestLeft / bestRight: the same per side. Each
    // is null until it has a finished set above 0 kg. The earliest set
    // wins a tie.
    public record Records(Record heaviest, Record bestSet, Record bestLeft, Record bestRight) {}
    public record History(Records records, List<HistorySession> sessions, boolean hasMore) {}

    @Transactional(readOnly = true)
    public History history(Long exerciseId, int page, int size) {
        if (!exerciseRepository.existsById(exerciseId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found");
        }
        List<ExerciseSet> sets = exerciseSetRepository.findFinishedSetsOldestFirst(exerciseId);

        Record heaviest = null;
        // Best set per side; the null key is two-sided sets. Their ids get the ★.
        Map<Side, Record> best = new HashMap<>();
        Map<Side, Long> bestId = new HashMap<>();
        for (ExerciseSet set : sets) {
            if (set.getWeight() <= 0) continue;
            Record here = new Record(set.getWeight(), set.getReps(), set.getSession().getDate());
            if (heaviest == null || set.getWeight() > heaviest.weight()
                    || (set.getWeight() == heaviest.weight() && set.getReps() > heaviest.reps())) {
                heaviest = here;
            }
            Record current = best.get(set.getSide());
            if (current == null || oneRepMax(here) > oneRepMax(current)) {
                best.put(set.getSide(), here);
                bestId.put(set.getSide(), set.getId());
            }
        }
        Set<Long> starred = new HashSet<>(bestId.values());

        Map<Long, HistorySession> sessions = new LinkedHashMap<>();
        for (ExerciseSet set : sets) {
            Session session = set.getSession();
            sessions.computeIfAbsent(session.getId(), id ->
                    new HistorySession(id, session.getDate(), session.getWorkoutId(), new ArrayList<>()))
                .sets().add(new HistorySet(set.getWeight(), set.getReps(), set.getSide(),
                    starred.contains(set.getId())));
        }

        List<HistorySession> newestFirst = new ArrayList<>(sessions.values());
        Collections.reverse(newestFirst);
        int from = Math.min(page * size, newestFirst.size());
        int to = Math.min(from + size, newestFirst.size());
        Records records = new Records(heaviest, best.get(null), best.get(Side.LEFT), best.get(Side.RIGHT));
        return new History(records, newestFirst.subList(from, to), to < newestFirst.size());
    }

    private static double oneRepMax(Record r) {
        return r.weight() * (1 + r.reps() / 30.0);
    }
}
