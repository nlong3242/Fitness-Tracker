package com.tsu2track.fitness_tracker.service;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.tsu2track.fitness_tracker.Exercise;
import com.tsu2track.fitness_tracker.ExerciseCategory;
import com.tsu2track.fitness_tracker.ExerciseRepository;

import tools.jackson.databind.ObjectMapper;

/* Fills in the built-in exercises at start-up from builtin-exercises.json,
   a part of free-exercise-db (public domain, github.com/yuhonas/free-exercise-db)
   in its own format. Each one is added once (matched on the dataset's id)
   and brought up to date on later starts, so a newer file just replaces
   the old one. Exercises taken out of the file stay: people may have
   logged them. Only strength exercises are used. */
@Component
public class BuiltInExercises implements ApplicationRunner {
    static final String FILE = "builtin-exercises.json";

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
        Map.entry("neck", ExerciseCategory.SHOULDERS),
        Map.entry("abdominals", ExerciseCategory.CORE));

    // "One-Arm Dumbbell Row", "Single Leg Squat": logged a side at a time.
    private static final Pattern ONE_SIDE = Pattern.compile("\\b(one|single)[- ]?(arm|leg)", Pattern.CASE_INSENSITIVE);

    private static final int MAX_CUES = 4000;

    private final ExerciseRepository exercises;
    private final ObjectMapper objectMapper;

    public BuiltInExercises(ExerciseRepository exercises, ObjectMapper objectMapper) {
        this.exercises = exercises;
        this.objectMapper = objectMapper;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) throws IOException {
        try (InputStream in = new ClassPathResource(FILE).getInputStream()) {
            load(List.of(objectMapper.readValue(in, Entry[].class)));
        }
    }

    void load(List<Entry> entries) {
        for (Entry entry : entries) {
            if (!"strength".equals(entry.category()) || entry.primaryMuscles() == null
                    || entry.primaryMuscles().isEmpty()) continue;
            ExerciseCategory group = GROUPS.get(entry.primaryMuscles().get(0));
            if (group == null) continue;

            Exercise exercise = exercises.findBySourceId(entry.id()).orElseGet(Exercise::new);
            exercise.setBuiltIn(true);
            exercise.setSourceId(entry.id());
            exercise.setName(entry.name());
            exercise.setCategory(group);
            exercise.setPrimaryMuscleGroups(String.join(", ", capitalized(entry.primaryMuscles())));
            exercise.setExerciseType(capitalize(entry.mechanic()));
            exercise.setEquipment(capitalize(entry.equipment()));
            exercise.setLevel(capitalize(entry.level()));
            exercise.setUnilateral(ONE_SIDE.matcher(entry.name()).find());
            // The step-by-step instructions are the cues, one step a line.
            String steps = entry.instructions() == null ? "" : String.join("\n", entry.instructions());
            exercise.setCues(steps.isEmpty() ? null
                : steps.length() > MAX_CUES ? steps.substring(0, MAX_CUES) : steps);
            exercises.save(exercise);
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
