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

import com.tsu2track.fitness_tracker.Exercise;
import com.tsu2track.fitness_tracker.ExerciseRepository;
import com.tsu2track.fitness_tracker.ExerciseSet;
import com.tsu2track.fitness_tracker.ExerciseSetRepository;
import com.tsu2track.fitness_tracker.LogType;
import com.tsu2track.fitness_tracker.Session;
import com.tsu2track.fitness_tracker.Side;
import com.tsu2track.fitness_tracker.security.CurrentUser;

/* An exercise's history across every workout that uses it: its PRs, and
   its finished sessions newest first, a page at a time. Unfinished
   sessions (the one in progress) never count.

   ★ (pr): the set shown as the Best set, so the star always matches the
   Best set card: one star, or one per side (bestLeft / bestRight) for a
   unilateral exercise. None while there's no set above 0 kg (no Best
   set either).

   Every session is listed, each with the type it was logged as (the app
   puts a divider where it changes), but records, ★ and the trend only
   count sets of the exercise's current type: after a type change it
   starts fresh. */
@Service
public class ExerciseHistoryService {
    private final ExerciseRepository exerciseRepository;
    private final ExerciseSetRepository exerciseSetRepository;

    public ExerciseHistoryService(ExerciseRepository exerciseRepository,
                                  ExerciseSetRepository exerciseSetRepository) {
        this.exerciseRepository = exerciseRepository;
        this.exerciseSetRepository = exerciseSetRepository;
    }

    public record HistorySet(double weight, int reps, Integer durationSeconds, Double distanceKm,
                             Side side, boolean pr) {}
    public record HistorySession(Long sessionId, LocalDate date, Long workoutId, LogType logType,
                                 List<HistorySet> sets) {}
    public record Record(double weight, int reps, Integer durationSeconds, Double distanceKm, LocalDate date) {}
    /* logType: the exercise's type now, which the records are for.
       bestSet: the best two-sided set; bestLeft / bestRight: the same per
       side. "Best" depends on the type:
         Weight & reps    highest estimated one-rep max, weight × (1 + reps / 30),
                          among sets above 0 kg
         Reps             most reps
         Time             longest time
         Distance & time  longest distance, the quicker time breaking a tie
                          (longest time when there's no distance)
       heaviest (Weight & reps): most weight on any side, more reps breaking
       a tie. fastestPace (Distance & time): least time per km.
       Each is null until it has a finished set; the earliest wins a tie. */
    public record Records(LogType logType, Record heaviest, Record bestSet, Record bestLeft, Record bestRight,
                          Record fastestPace) {}
    /* The History tab's chart: each day's best by the same measure as
       Best set, one point per day and side (side null when two-sided),
       oldest first. Sessions on the same day share a point: the chart shows
       progress over time, and the list below it shows every session. metric says what value is:
         MAX_KG   estimated one-rep max (Weight & reps, sets above 0 kg)
         REPS     most reps
         SECONDS  longest time (Time, and Distance & time with no distances)
         KM       longest distance (Distance & time; sessions without one left out) */
    public record TrendPoint(LocalDate date, Side side, double value) {}
    public record Trend(String metric, List<TrendPoint> points) {}
    // trend: only on the first page.
    public record History(Records records, List<HistorySession> sessions, boolean hasMore, Trend trend) {}

    @Transactional(readOnly = true)
    public History history(Long exerciseId, int page, int size) {
        Exercise exercise = exerciseRepository.findUsable(exerciseId, CurrentUser.id())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found"));
        LogType type = exercise.getLogType();
        List<ExerciseSet> sets = exerciseSetRepository.findFinishedSetsOldestFirst(exerciseId, CurrentUser.id());

        Record heaviest = null;
        Record fastestPace = null;
        // Best set per side; the null key is two-sided sets. Their ids get the ★.
        Map<Side, Record> best = new HashMap<>();
        Map<Side, Long> bestId = new HashMap<>();
        for (ExerciseSet set : sets) {
            if (set.getLogType() != type) continue;
            if (type == LogType.WEIGHT_REPS && set.getWeight() <= 0) continue;
            Record here = record(set);
            if (type == LogType.WEIGHT_REPS && (heaviest == null || set.getWeight() > heaviest.weight()
                    || (set.getWeight() == heaviest.weight() && set.getReps() > heaviest.reps()))) {
                heaviest = here;
            }
            if (type == LogType.DISTANCE_TIME && set.getDistanceKm() != null
                    && (fastestPace == null || pace(here) < pace(fastestPace))) {
                fastestPace = here;
            }
            Record current = best.get(set.getSide());
            if (current == null || better(type, here, current)) {
                best.put(set.getSide(), here);
                bestId.put(set.getSide(), set.getId());
            }
        }
        Set<Long> starred = new HashSet<>(bestId.values());

        Map<Long, HistorySession> sessions = new LinkedHashMap<>();
        for (ExerciseSet set : sets) {
            Session session = set.getSession();
            sessions.computeIfAbsent(session.getId(), id ->
                    new HistorySession(id, session.getDate(), session.getWorkoutId(), set.getLogType(), new ArrayList<>()))
                .sets().add(new HistorySet(set.getWeight(), set.getReps(), set.getDurationSeconds(),
                    set.getDistanceKm(), set.getSide(), starred.contains(set.getId())));
        }

        List<HistorySession> newestFirst = new ArrayList<>(sessions.values());
        Collections.reverse(newestFirst);
        int from = Math.min(page * size, newestFirst.size());
        int to = Math.min(from + size, newestFirst.size());
        Records records = new Records(type, heaviest, best.get(null), best.get(Side.LEFT), best.get(Side.RIGHT),
            fastestPace);
        return new History(records, newestFirst.subList(from, to), to < newestFirst.size(),
            page == 0 ? trend(type, sets) : null);
    }

    private static Trend trend(LogType type, List<ExerciseSet> sets) {
        boolean anyKm = type == LogType.DISTANCE_TIME
            && sets.stream().anyMatch(set -> set.getLogType() == type && set.getDistanceKm() != null);
        String metric = switch (type) {
            case WEIGHT_REPS -> "MAX_KG";
            case REPS -> "REPS";
            case TIME -> "SECONDS";
            case DISTANCE_TIME -> anyKm ? "KM" : "SECONDS";
        };
        // Sets come oldest first, so the points do too.
        Map<String, TrendPoint> points = new LinkedHashMap<>();
        for (ExerciseSet set : sets) {
            if (set.getLogType() != type) continue;
            Double value = switch (metric) {
                case "MAX_KG" -> set.getWeight() > 0 ? oneRepMax(record(set)) : null;
                case "REPS" -> (double) set.getReps();
                case "KM" -> set.getDistanceKm();
                default -> set.getDurationSeconds() == null ? null : (double) set.getDurationSeconds();
            };
            if (value == null) continue;
            double rounded = Math.round(value * 10) / 10.0;
            points.merge(set.getSession().getDate() + "/" + set.getSide(),
                new TrendPoint(set.getSession().getDate(), set.getSide(), rounded),
                (a, b) -> b.value() > a.value() ? b : a);
        }
        return new Trend(metric, new ArrayList<>(points.values()));
    }

    private static Record record(ExerciseSet set) {
        return new Record(set.getWeight(), set.getReps(), set.getDurationSeconds(), set.getDistanceKm(),
            set.getSession().getDate());
    }

    // Whether a beats b as the type's Best set (see Records).
    private static boolean better(LogType type, Record a, Record b) {
        return switch (type) {
            case WEIGHT_REPS -> oneRepMax(a) > oneRepMax(b);
            case REPS -> a.reps() > b.reps();
            case TIME -> a.durationSeconds() > b.durationSeconds();
            case DISTANCE_TIME -> {
                double da = a.distanceKm() != null ? a.distanceKm() : 0;
                double db = b.distanceKm() != null ? b.distanceKm() : 0;
                if (da != db) yield da > db;
                yield da > 0 ? a.durationSeconds() < b.durationSeconds()
                             : a.durationSeconds() > b.durationSeconds();
            }
        };
    }

    private static double oneRepMax(Record r) {
        return r.weight() * (1 + r.reps() / 30.0);
    }

    // Seconds per km.
    private static double pace(Record r) {
        return r.durationSeconds() / r.distanceKm();
    }
}
