package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

import com.jayway.jsonpath.JsonPath;

/* What GET /sessions/overview adds for the redesigned Home, full stack.
   Past workouts are put straight in the database, since the app only
   logs today. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class HomeOverviewWebTest {

    // Monday 2 to Sunday 8 March 2026.
    private static final LocalDate MON = LocalDate.of(2026, 3, 2);
    private static final int SATURDAYS = 0b0100000;

    @Autowired MockMvc mvc;
    @Autowired WorkoutRepository workouts;
    @Autowired SessionRepository sessions;
    @Autowired ExerciseRepository exercises;
    @Autowired ExerciseSetRepository setsRepo;

    private String bearer;
    private long userId;
    private Workout workout;

    @BeforeEach
    void signUp() throws Exception {
        String json = mvc.perform(post("/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\": \"home@example.com\", \"password\": \"password123\", \"inviteCode\": \""
                    + TestAuth.INVITE_CODE + "\"}"))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        bearer = "Bearer " + JsonPath.read(json, "$.token");
        String me = mvc.perform(get("/auth/me").header("Authorization", bearer)).andReturn().getResponse().getContentAsString();
        userId = ((Number) JsonPath.read(me, "$.id")).longValue();
        Workout w = new Workout("Push Day");
        w.setUserId(userId);
        workout = workouts.save(w);
    }

    // --- weekDays: the week strip ---

    @Test
    void weekDaysMarkDoneAndPlannedDaysMondayToSunday() throws Exception {
        session(MON, true);                         // Mon: done
        session(MON.plusDays(1), false);            // Tue: only an unfinished one
        plan(MON.plusDays(2), null);                // Wed: planned
        plan(MON.plusDays(3), "SKIPPED");           // Thu: skipped, so not planned
        plan(MON.plusDays(4), null);                // Fri: planned and done
        session(MON.plusDays(4), true);
        repeat(SATURDAYS);                          // Sat: from the repeat rule

        overview()
            .andExpect(jsonPath("$.weekDays", hasSize(7)))
            .andExpect(jsonPath("$.weekDays[0].date").value("2026-03-02"))
            .andExpect(jsonPath("$.weekDays[6].date").value("2026-03-08"))
            .andExpect(day(0, true, false))
            .andExpect(day(1, false, false))
            .andExpect(day(2, false, true))
            .andExpect(day(3, false, false))
            .andExpect(day(4, true, true))
            .andExpect(day(5, false, true))
            .andExpect(day(6, false, false));
    }

    // --- each day's workouts and plans, and GET /sessions/week for other weeks ---

    @Test
    void eachDayListsItsWorkoutsAndPlans() throws Exception {
        Workout newLegs = new Workout("Legs");
        newLegs.setUserId(userId);
        Workout legs = workouts.save(newLegs);
        Exercise bench = new Exercise("Bench");
        bench.setCategory(ExerciseCategory.CHEST);
        bench.setUserId(userId);
        bench = exercises.save(bench);

        Session push = session(MON, true);          // Mon: two workouts, in the order done
        push.setStartedAt(Instant.parse("2026-03-02T08:00:00Z"));
        push.setFinishedAt(Instant.parse("2026-03-02T08:52:00Z"));
        sessions.save(push);
        sets(push, bench, 3);
        Session core = session(MON, true);
        core.setWorkout(legs);
        sessions.save(core);
        sets(core, bench, 1);
        session(MON, false);                        // unfinished: not listed
        plan(MON.plusDays(3), null);                // Thu: a saved plan
        plan(MON.plusDays(4), "SKIPPED");           // Fri: skipped, listed apart
        repeat(SATURDAYS);                          // Sat: a repeat rule's day

        for (ResultActions week : List.of(overview(), mvc.perform(get("/sessions/week")
                .param("weekStart", MON.toString()).header("Authorization", bearer)).andExpect(status().isOk()))) {
            week.andExpect(result -> {
                String json = result.getResponse().getContentAsString();
                String root = json.startsWith("[") ? "$" : "$.weekDays";
                jsonPath(root + "[0].sessions", hasSize(2)).match(result);
                jsonPath(root + "[0].sessions[0].sessionId").value(push.getId()).match(result);
                jsonPath(root + "[0].sessions[0].workoutName").value("Push Day").match(result);
                jsonPath(root + "[0].sessions[0].sets").value(3).match(result);
                jsonPath(root + "[0].sessions[0].durationSeconds").value(52 * 60).match(result);
                jsonPath(root + "[0].sessions[1].workoutId").value(legs.getId()).match(result);
                jsonPath(root + "[0].sessions[1].workoutName").value("Legs").match(result);
                jsonPath(root + "[0].sessions[1].sets").value(1).match(result);
                jsonPath(root + "[0].sessions[1].durationSeconds").isEmpty().match(result);
                jsonPath(root + "[0].plans", hasSize(0)).match(result);
                jsonPath(root + "[3].plans", hasSize(1)).match(result);
                jsonPath(root + "[3].plans[0].workoutName").value("Push Day").match(result);
                jsonPath(root + "[3].plans[0].scheduleId").isNumber().match(result);
                jsonPath(root + "[3].skipped", hasSize(0)).match(result);
                jsonPath(root + "[4].plans", hasSize(0)).match(result);
                jsonPath(root + "[4].skipped", hasSize(1)).match(result);
                jsonPath(root + "[4].skipped[0].workoutName").value("Push Day").match(result);
                jsonPath(root + "[4].skipped[0].scheduleId").isNumber().match(result);
                jsonPath(root + "[5].plans[0].workoutId").value(workout.getId()).match(result);
                jsonPath(root + "[5].plans[0].scheduleId").isEmpty().match(result);
                jsonPath(root + "[6].sessions", hasSize(0)).match(result);
            });
        }
    }

    @Test
    void weekNeedsWeekStart() throws Exception {
        mvc.perform(get("/sessions/week").header("Authorization", bearer)).andExpect(status().isBadRequest());
    }

    @Test
    void weekDaysOnlyCountThatWeek() throws Exception {
        session(MON.minusDays(1), true);            // the Sunday before
        plan(MON.plusDays(7), null);                // the Monday after

        overview().andExpect(jsonPath("$.weekDays[?(@.done == true || @.planned == true)]", hasSize(0)));
    }

    @Test
    void aNewAccountsWeekIsSevenEmptyDays() throws Exception {
        overview()
            .andExpect(jsonPath("$.weekDays", hasSize(7)))
            .andExpect(jsonPath("$.weekDays[?(@.done == true || @.planned == true)]", hasSize(0)))
            .andExpect(jsonPath("$.lastSession").isEmpty())
            .andExpect(jsonPath("$.lastSessionSets").value(0))
            .andExpect(jsonPath("$.nextLastDone").isEmpty())
            .andExpect(jsonPath("$.latestPr").isEmpty());
    }

    // --- latestPr (worked out in ExerciseHistoryService; see ExerciseHistoryTest) ---

    @Test
    void latestPrComesWithTheExerciseSessionAndEachSide() throws Exception {
        long bench = exercise("Bench", false);
        long row = exercise("One-Arm Row", true);
        long session = start(null);
        set(session, bench, "{\"weight\": 80, \"reps\": 5}");
        set(session, row, "{\"weight\": 20, \"reps\": 8, \"side\": \"LEFT\"}");
        set(session, row, "{\"weight\": 18, \"reps\": 8, \"side\": \"RIGHT\"}");
        finish(session);

        overview()
            .andExpect(jsonPath("$.latestPr.exerciseId").value(row))
            .andExpect(jsonPath("$.latestPr.exerciseName").value("One-Arm Row"))
            .andExpect(jsonPath("$.latestPr.logType").value("WEIGHT_REPS"))
            .andExpect(jsonPath("$.latestPr.sessionId").value(session))
            .andExpect(jsonPath("$.latestPr.workoutId").value(workout.getId()))
            .andExpect(jsonPath("$.latestPr.date").value(LocalDate.now().toString()))
            .andExpect(jsonPath("$.latestPr.sides", hasSize(2)))
            .andExpect(jsonPath("$.latestPr.sides[0].side").value("LEFT"))
            .andExpect(jsonPath("$.latestPr.sides[0].weight").value(20.0))
            .andExpect(jsonPath("$.latestPr.sides[0].reps").value(8))
            .andExpect(jsonPath("$.latestPr.sides[1].side").value("RIGHT"))
            .andExpect(jsonPath("$.latestPr.sides[1].weight").value(18.0));
    }

    // --- nextLastDone: "last done Mon 10 Nov" ---

    @Test
    void nextLastDoneIsWhenThePlannedWorkoutWasLastFinished() throws Exception {
        Workout legs = new Workout("Legs");
        legs.setUserId(userId);
        legs = workouts.save(legs);
        session(MON.minusDays(10), true);
        session(MON.minusDays(6), true);            // Push Day last done here
        session(MON.minusDays(5), false);           // started, never finished
        Session other = session(MON.minusDays(3), true);
        other.setWorkout(legs);                     // another workout, more recent
        sessions.save(other);
        plan(MON, null);

        overview()
            .andExpect(jsonPath("$.nextPlanned.workoutId").value(workout.getId()))
            .andExpect(jsonPath("$.nextLastDone").value(MON.minusDays(6).toString()));
    }

    @Test
    void nextLastDoneIsEmptyForAWorkoutNeverDone() throws Exception {
        plan(MON.plusDays(1), null);

        overview()
            .andExpect(jsonPath("$.nextPlanned.workoutId").value(workout.getId()))
            .andExpect(jsonPath("$.nextLastDone").isEmpty());
    }

    // --- lastSessionSets and the length: "14 sets · 52 min" ---

    @Test
    void lastSessionSetsCountsEachSideOnItsOwnAndComesWithItsLength() throws Exception {
        long bench = exercise("Bench", false);
        long row = exercise("One-Arm Row", true);
        long session = start(Instant.now().minus(52, ChronoUnit.MINUTES));
        for (int i = 0; i < 3; i++) set(session, bench, "{\"weight\": 80, \"reps\": 5}");
        for (int i = 0; i < 2; i++) {
            set(session, row, "{\"weight\": 20, \"reps\": 8, \"side\": \"LEFT\"}");
            set(session, row, "{\"weight\": 20, \"reps\": 8, \"side\": \"RIGHT\"}");
        }
        finish(session);

        String json = overview()
            .andExpect(jsonPath("$.lastSession.id").value(session))
            .andExpect(jsonPath("$.lastSessionSets").value(7))
            .andReturn().getResponse().getContentAsString();
        long seconds = ((Number) JsonPath.read(json, "$.lastSession.durationSeconds")).longValue();
        assertThat(seconds).isBetween(52L * 60, 52L * 60 + 30);
    }

    @Test
    void lastSessionSetsAreTheNewestFinishedOnes() throws Exception {
        long bench = exercise("Bench", false);
        long earlier = start(null);
        set(earlier, bench, "{\"weight\": 80, \"reps\": 5}");
        set(earlier, bench, "{\"weight\": 80, \"reps\": 5}");
        finish(earlier);
        long latest = start(null);
        set(latest, bench, "{\"weight\": 85, \"reps\": 5}");
        finish(latest);
        long open = start(null);                    // in progress: not a last session
        set(open, bench, "{\"weight\": 90, \"reps\": 5}");
        set(open, bench, "{\"weight\": 90, \"reps\": 5}");

        overview()
            .andExpect(jsonPath("$.lastSession.id").value(latest))
            .andExpect(jsonPath("$.lastSessionSets").value(1));
    }

    // --- helpers ---

    private ResultActions overview() throws Exception {
        return mvc.perform(get("/sessions/overview").param("weekStart", MON.toString()).param("today", MON.toString())
                .header("Authorization", bearer))
            .andExpect(status().isOk());
    }

    private static org.springframework.test.web.servlet.ResultMatcher day(int i, boolean done, boolean planned) {
        return result -> {
            jsonPath("$.weekDays[" + i + "].done").value(done).match(result);
            jsonPath("$.weekDays[" + i + "].planned").value(planned).match(result);
        };
    }

    private void sets(Session session, Exercise exercise, int n) {
        for (int i = 0; i < n; i++) {
            ExerciseSet set = new ExerciseSet();
            set.setSession(session);
            set.setExercise(exercise);
            set.setWeight(60);
            set.setReps(5);
            setsRepo.save(set);
        }
    }

    private Session session(LocalDate date, boolean finished) {
        Session s = new Session();
        s.setWorkout(workout);
        s.setDate(date);
        s.setFinished(finished);
        s.setUserId(userId);
        return sessions.save(s);
    }

    private void plan(LocalDate date, String status) throws Exception {
        mvc.perform(post("/scheduled-workouts").header("Authorization", bearer).contentType(MediaType.APPLICATION_JSON)
                .content("{\"date\": \"" + date + "\", \"workoutId\": " + workout.getId()
                    + (status != null ? ", \"status\": \"" + status + "\"" : "") + "}"))
            .andExpect(status().isOk());
    }

    private long exercise(String name, boolean oneSided) throws Exception {
        return id(mvc.perform(post("/workouts/" + workout.getId() + "/exercises").header("Authorization", bearer)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\": \"" + name + "\", \"category\": \"CHEST\", \"unilateral\": " + oneSided + "}")));
    }

    private long start(Instant startedAt) throws Exception {
        return id(mvc.perform(post("/workouts/" + workout.getId() + "/sessions").header("Authorization", bearer)
            .contentType(MediaType.APPLICATION_JSON)
            .content(startedAt != null ? "{\"startedAt\": \"" + startedAt + "\"}" : "{}")));
    }

    private void set(long session, long exercise, String body) throws Exception {
        mvc.perform(post("/sessions/" + session + "/sets?exerciseId=" + exercise).header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk());
    }

    private void finish(long session) throws Exception {
        mvc.perform(post("/sessions/" + session + "/finish").header("Authorization", bearer))
            .andExpect(status().isOk());
    }

    private static long id(ResultActions result) throws Exception {
        String json = result.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private void repeat(int weekdays) throws Exception {
        mvc.perform(put("/workouts/" + workout.getId() + "/repeat?today=" + MON).header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"weekdays\": " + weekdays + ", \"startDate\": \"" + MON + "\"}"))
            .andExpect(status().isOk());
    }
}
