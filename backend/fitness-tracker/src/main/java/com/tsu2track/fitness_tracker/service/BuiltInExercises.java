package com.tsu2track.fitness_tracker.service;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.tsu2track.fitness_tracker.Exercise;
import com.tsu2track.fitness_tracker.ExerciseCategory;
import com.tsu2track.fitness_tracker.ExerciseRepository;
import com.tsu2track.fitness_tracker.LogType;
import com.tsu2track.fitness_tracker.SessionRepository;

import tools.jackson.databind.ObjectMapper;

/* Fills in the built-in exercises at start-up from builtin-exercises.json
   (app.builtin-exercises; tests use a small file of their own), a part of
   free-exercise-db (public domain, github.com/yuhonas/free-exercise-db) in
   its own format. Each one is added once (matched on the dataset's id)
   and brought up to date on later starts, so a newer file just replaces
   the old one. Exercises taken out of the file stay: people may have
   logged them. Only strength and cardio exercises are used; cardio
   ones go in Cardio, whatever muscle they work.
   Each is logged as Weight & reps unless listed below; a type change
   waits while anyone has the exercise in a workout being done, as an
   edit does (ExerciseService).
   It runs once the app is set up but before the server takes requests,
   so the list never comes back without them; a broken file stops the
   start. */
@Component
public class BuiltInExercises implements SmartInitializingSingleton {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Entry(String id, String name, String category, String level, String mechanic,
                        String equipment, List<String> primaryMuscles, List<String> instructions) {}

    // The dataset's muscles, onto the app's six groups.
    private static final Map<String, ExerciseCategory> GROUPS = Map.ofEntries(
        Map.entry("chest", ExerciseCategory.CHEST),
        Map.entry("biceps", ExerciseCategory.ARMS),
        Map.entry("triceps", ExerciseCategory.ARMS),
        Map.entry("forearms", ExerciseCategory.ARMS),
        Map.entry("lats", ExerciseCategory.BACK),
        Map.entry("middle back", ExerciseCategory.BACK),
        Map.entry("lower back", ExerciseCategory.BACK),
        Map.entry("traps", ExerciseCategory.BACK),
        Map.entry("quadriceps", ExerciseCategory.LEGS),
        Map.entry("hamstrings", ExerciseCategory.LEGS),
        Map.entry("glutes", ExerciseCategory.LEGS),
        Map.entry("calves", ExerciseCategory.LEGS),
        Map.entry("adductors", ExerciseCategory.LEGS),
        Map.entry("abductors", ExerciseCategory.LEGS),
        Map.entry("shoulders", ExerciseCategory.SHOULDERS),
        Map.entry("neck", ExerciseCategory.OTHER),
        Map.entry("abdominals", ExerciseCategory.CORE));

    // Where the main muscle gives the wrong idea, by dataset id: the barbell
    // deadlift and good morning go with the other deadlifts (lower back would
    // put them in Back), and balance and conditioning moves go in Other.
    private static final Map<String, ExerciseCategory> MOVED = Map.of(
        "Barbell_Deadlift", ExerciseCategory.LEGS,
        "Stiff_Leg_Barbell_Good_Morning", ExerciseCategory.LEGS,
        "Balance_Board", ExerciseCategory.OTHER,
        "Downward_Facing_Balance", ExerciseCategory.OTHER,
        "Battling_Ropes", ExerciseCategory.OTHER,
        "Sled_Overhead_Backward_Walk", ExerciseCategory.OTHER);

    // Held for time, by dataset id (the dataset calls most of these "static").
    private static final Set<String> TIMED = Set.of(
        "Plank", "Side_Bridge",
        "Isometric_Neck_Exercise_-_Front_And_Back", "Isometric_Neck_Exercise_-_Sides",
        "Balance_Board", "Battling_Ropes", "Downward_Facing_Balance");

    // Walked for a distance. Bodyweight ("body only") ones that aren't
    // timed are logged as Reps.
    private static final Set<String> DISTANCED = Set.of("Sled_Overhead_Backward_Walk");

    // "One-Arm Dumbbell Row", "Single Leg Squat": logged a side at a time.
    private static final Pattern ONE_SIDE = Pattern.compile("\\b(one|single)[- ]?(arm|leg)", Pattern.CASE_INSENSITIVE);

    private static final int MAX_CUES = 4000;

    private final ExerciseRepository exercises;
    private final SessionRepository sessions;
    private final ObjectMapper objectMapper;
    private final Resource file;
    private final TransactionTemplate transaction;

    public BuiltInExercises(ExerciseRepository exercises, SessionRepository sessions, ObjectMapper objectMapper,
                            @Value("${app.builtin-exercises}") Resource file,
                            PlatformTransactionManager transactions) {
        this.exercises = exercises;
        this.sessions = sessions;
        this.objectMapper = objectMapper;
        this.file = file;
        this.transaction = new TransactionTemplate(transactions);
    }

    @Override
    public void afterSingletonsInstantiated() {
        loadFile();
    }

    public void loadFile() {
        List<Entry> entries;
        try (InputStream in = file.getInputStream()) {
            entries = List.of(objectMapper.readValue(in, Entry[].class));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        transaction.executeWithoutResult(status -> load(entries));
    }

    /* The ones already there come in one query and are matched here. Only
       new ones are saved; the rest are changed in place, and only those
       that really changed get written when the transaction ends. */
    void load(List<Entry> entries) {
        Map<String, Exercise> existing = new HashMap<>();
        for (Exercise e : exercises.findByBuiltInTrue()) existing.put(e.getSourceId(), e);
        List<Exercise> added = new ArrayList<>();

        for (Entry entry : entries) {
            ExerciseCategory group = categoryOf(entry);
            if (group == null) continue;

            Exercise exercise = existing.get(entry.id());
            if (exercise == null) {
                exercise = new Exercise();
                exercise.setLogType(logTypeOf(entry));
                added.add(exercise);
            } else {
                changeLogType(exercise, logTypeOf(entry));
            }
            exercise.setBuiltIn(true);
            exercise.setSourceId(entry.id());
            exercise.setName(entry.name());
            exercise.setCategory(group);
            exercise.setPrimaryMuscleGroups(String.join(", ", capitalized(entry.primaryMuscles())));
            exercise.setExerciseType(capitalize(entry.mechanic()));
            exercise.setEquipment("e-z curl bar".equals(entry.equipment()) ? "EZ Bar" : capitalize(entry.equipment()));
            exercise.setLevel(capitalize(entry.level()));
            exercise.setUnilateral(ONE_SIDE.matcher(entry.name()).find());
            // The step-by-step instructions are the cues, one step a line.
            String steps = entry.instructions() == null ? "" : String.join("\n", entry.instructions());
            exercise.setCues(steps.isEmpty() ? null
                : steps.length() > MAX_CUES ? steps.substring(0, MAX_CUES) : steps);
        }
        exercises.saveAll(added);
    }

    private static ExerciseCategory categoryOf(Entry entry) {
        if ("cardio".equals(entry.category())) return ExerciseCategory.CARDIO;
        if (!"strength".equals(entry.category()) || entry.primaryMuscles() == null
                || entry.primaryMuscles().isEmpty()) return null;
        return MOVED.getOrDefault(entry.id(), GROUPS.get(entry.primaryMuscles().get(0)));
    }

    private static LogType logTypeOf(Entry entry) {
        if ("cardio".equals(entry.category())) return LogType.DISTANCE_TIME;
        if (TIMED.contains(entry.id())) return LogType.TIME;
        if (DISTANCED.contains(entry.id())) return LogType.DISTANCE_TIME;
        if ("body only".equals(entry.equipment())) return LogType.REPS;
        return LogType.WEIGHT_REPS;
    }

    private void changeLogType(Exercise exercise, LogType wanted) {
        if (wanted == exercise.getLogType()) {
            exercise.setPendingLogType(null);
        } else if (sessions.existsOpenSessionWith(null, exercise.getId())) {
            exercise.setPendingLogType(wanted);
        } else {
            exercise.setLogType(wanted);
            exercise.setPendingLogType(null);
        }
    }

    private static List<String> capitalized(List<String> words) {
        List<String> out = new ArrayList<>();
        for (String w : words) out.add(capitalize(w));
        return out;
    }

    private static String capitalize(String s) {
        if (s == null || s.isEmpty()) return null;
        return s.substring(0, 1).toUpperCase(Locale.ROOT) + s.substring(1);
    }
}
