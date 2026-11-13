package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import com.jayway.jsonpath.JsonPath;

/* Reset an exercise (GET /exercises/{id}/history/count, DELETE
   /exercises/{id}/history): every set of it in the account's finished
   sessions goes, in every workout; sessions left empty go with their
   calendar entry undone; a workout in progress, other exercises, other
   accounts and the exercise itself stay. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ResetExerciseWebTest {

    @Autowired MockMvc mvc;
    @Autowired ScheduledWorkoutRepository scheduledWorkoutRepository;
    @Autowired SessionRepository sessionRepository;

    private String bearer;
    private long push;
    private long upper;
    private long bench;
    private long fly;

    @BeforeEach
    void setUp() throws Exception {
        bearer = signup("reset@example.com");
        push = id(send(post("/workouts"), "{\"name\": \"Push\"}"));
        upper = id(send(post("/workouts"), "{\"name\": \"Upper\"}"));
        bench = id(send(post("/exercises"), "{\"name\": \"Bench\", \"category\": \"CHEST\"}"));
        fly = id(send(post("/exercises"), "{\"name\": \"Fly\", \"category\": \"CHEST\"}"));
    }

    @Test
    void countsSetsAndSessionsAcrossWorkouts() throws Exception {
        doWorkout(push, true, bench, 60, 70);
        doWorkout(upper, true, bench, 80);
        doWorkout(push, false, bench, 90); // in progress: not counted

        String json = getJson("/exercises/" + bench + "/history/count");
        assertThat((Integer) JsonPath.read(json, "$.sets")).isEqualTo(3);
        assertThat((Integer) JsonPath.read(json, "$.sessions")).isEqualTo(2);
    }

    @Test
    void deletesTheExercisesHistoryEverywhere() throws Exception {
        doWorkout(push, true, bench, 60);
        doWorkout(upper, true, bench, 80);

        String json = reset(bench);
        assertThat((Integer) JsonPath.read(json, "$.sets")).isEqualTo(2);

        String history = getJson("/exercises/" + bench + "/history");
        assertThat((List<?>) JsonPath.read(history, "$.sessions")).isEmpty();
        mvc.perform(get("/exercises/" + bench + "/last-done").header("Authorization", bearer))
            .andExpect(status().isNoContent());
        // still in the library
        getJson("/exercises/" + bench);
    }

    @Test
    void aSessionWithOtherExercisesStaysWithoutIt() throws Exception {
        long session = doWorkout(push, true, bench, 60, fly, 20);

        reset(bench);

        String sets = getJson("/sessions/" + session + "/sets");
        List<Number> exerciseIds = JsonPath.read(sets, "$[*].exerciseId");
        assertThat(exerciseIds).extracting(Number::longValue).containsExactly(fly);
        String summary = getJson("/sessions/" + session + "/exercises");
        List<Number> listed = JsonPath.read(summary, "$[*].exerciseId");
        assertThat(listed).extracting(Number::longValue).doesNotContain(bench);
        assertThat(listed).extracting(Number::longValue).contains(fly);
    }

    @Test
    void aSessionLeftEmptyGoes() throws Exception {
        long session = doWorkout(push, true, bench, 60);

        reset(bench);

        assertThat(sessionRepository.findById(session)).isEmpty();
        String page = getJson("/workouts/" + push + "/sessions");
        assertThat((List<?>) JsonPath.read(page, "$.content")).isEmpty();
    }

    @Test
    void anEmptiedDaysCalendarEntryIsUndone() throws Exception {
        LocalDate today = LocalDate.now();
        long ruleDay = doWorkout(push, true, bench, 60);
        long planned = id(send(post("/scheduled-workouts"), "{\"date\": \"" + today + "\", \"workoutId\": " + push
            + ", \"status\": \"COMPLETED\", \"sessionId\": " + ruleDay + "}"));
        // a repeating plan's day (setting one up through the API needs a rule)
        ScheduledWorkout fromRule = scheduledWorkoutRepository.findById(planned).orElseThrow();
        fromRule.setRepeatDate(today);
        scheduledWorkoutRepository.saveAndFlush(fromRule);
        long unplannedSession = doWorkout(upper, true, bench, 70);
        long unplanned = id(send(post("/scheduled-workouts"), "{\"date\": \"" + today + "\", \"workoutId\": " + upper
            + ", \"status\": \"COMPLETED\", \"sessionId\": " + unplannedSession + "}"));

        reset(bench);

        ScheduledWorkout back = scheduledWorkoutRepository.findById(planned).orElseThrow();
        assertThat(back.getStatus()).isEqualTo(ScheduleStatus.PLANNED);
        assertThat(back.getSessionId()).isNull();
        assertThat(scheduledWorkoutRepository.findById(unplanned)).isEmpty();
    }

    @Test
    void aWorkoutInProgressIsLeftAlone() throws Exception {
        long open = doWorkout(push, false, bench, 90);

        reset(bench);

        String sets = getJson("/sessions/" + open + "/sets");
        assertThat((List<?>) JsonPath.read(sets, "$")).hasSize(1);
    }

    @Test
    void anotherAccountsHistoryOfASharedExerciseStays() throws Exception {
        String all = getJson("/exercises");
        List<Number> builtIns = JsonPath.read(all, "$[?(@.builtIn == true)].id");
        long shared = builtIns.get(0).longValue();
        doWorkout(push, true, shared, 60);

        String mine = bearer;
        String theirs = signup("other@example.com");
        bearer = theirs;
        long theirWorkout = id(send(post("/workouts"), "{\"name\": \"Theirs\"}"));
        doWorkout(theirWorkout, true, shared, 100);

        bearer = mine;
        reset(shared);
        assertThat((Integer) JsonPath.read(getJson("/exercises/" + shared + "/history/count"), "$.sets")).isZero();

        bearer = theirs;
        assertThat((Integer) JsonPath.read(getJson("/exercises/" + shared + "/history/count"), "$.sets")).isEqualTo(1);
    }

    @Test
    void anotherAccountsExerciseIsNotFound() throws Exception {
        doWorkout(push, true, bench, 60);
        bearer = signup("nosy@example.com");

        mvc.perform(delete("/exercises/" + bench + "/history").header("Authorization", bearer))
            .andExpect(status().isNotFound());
        mvc.perform(get("/exercises/" + bench + "/history/count").header("Authorization", bearer))
            .andExpect(status().isNotFound());
    }

    @Test
    void nothingToResetIsFine() throws Exception {
        String json = reset(bench);
        assertThat((Integer) JsonPath.read(json, "$.sets")).isZero();
    }

    // --- helpers ---

    // A session of the workout: pairs of (exerciseId, weight...) as
    // exerciseId followed by its weights; × 5 reps each.
    private long doWorkout(long workoutId, boolean finish, Object... spec) throws Exception {
        long session = id(send(post("/workouts/" + workoutId + "/sessions"), "{}"));
        long exercise = 0;
        for (Object o : spec) {
            if (o instanceof Long l) { exercise = l; continue; }
            send(post("/sessions/" + session + "/sets?exerciseId=" + exercise),
                "{\"weight\": " + o + ", \"reps\": 5}");
        }
        if (finish) send(post("/sessions/" + session + "/finish"), "{}");
        return session;
    }

    private String reset(long exerciseId) throws Exception {
        return mvc.perform(delete("/exercises/" + exerciseId + "/history").header("Authorization", bearer))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private String getJson(String url) throws Exception {
        return mvc.perform(get(url).header("Authorization", bearer))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private String send(MockHttpServletRequestBuilder request, String body) throws Exception {
        return mvc.perform(request.header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private static long id(String json) {
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private String signup(String email) throws Exception {
        String json = mvc.perform(post("/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\": \"" + email + "\", \"password\": \"password123\", \"inviteCode\": \""
                    + TestAuth.INVITE_CODE + "\"}"))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return "Bearer " + JsonPath.read(json, "$.token");
    }
}
