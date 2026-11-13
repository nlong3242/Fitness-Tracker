package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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

/* GET /exercises/{id}/last-done: the last time an exercise was done in any
   workout, with the workout's name and the date, for "last time" hints on
   an exercise added to (or swapped into) a live workout. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class LastDoneWebTest {

    @Autowired MockMvc mvc;

    private String bearer;
    private long push;
    private long upper;
    private long bench;

    @BeforeEach
    void setUp() throws Exception {
        bearer = signup("lastdone@example.com");
        push = id(send(post("/workouts"), "{\"name\": \"Push\"}"));
        upper = id(send(post("/workouts"), "{\"name\": \"Upper\"}"));
        bench = id(send(post("/exercises"), "{\"name\": \"Bench\", \"category\": \"CHEST\"}"));
    }

    @Test
    void givesTheSetsTheWorkoutAndTheDate() throws Exception {
        doWorkout(push, bench, true, 60, 70);

        String json = lastDone(bench);
        assertThat((String) JsonPath.read(json, "$.workoutName")).isEqualTo("Push");
        assertThat(((Number) JsonPath.read(json, "$.workoutId")).longValue()).isEqualTo(push);
        assertThat((String) JsonPath.read(json, "$.date")).isEqualTo(LocalDate.now().toString());
        List<Double> weights = JsonPath.read(json, "$.sets[*].weight");
        assertThat(weights).containsExactly(60.0, 70.0);
    }

    @Test
    void theLatestTimeWinsWhicheverWorkoutItWasIn() throws Exception {
        doWorkout(push, bench, true, 60);
        doWorkout(upper, bench, true, 80);

        String json = lastDone(bench);
        assertThat((String) JsonPath.read(json, "$.workoutName")).isEqualTo("Upper");
        List<Double> weights = JsonPath.read(json, "$.sets[*].weight");
        assertThat(weights).containsExactly(80.0);
    }

    @Test
    void neverDoneIsNoContent() throws Exception {
        lastDoneStatus(bench, 204);
    }

    @Test
    void aWorkoutStillInProgressDoesNotCount() throws Exception {
        doWorkout(push, bench, false, 60);

        lastDoneStatus(bench, 204);
    }

    @Test
    void afterATypeChangeOldSetsDoNotCount() throws Exception {
        doWorkout(push, bench, true, 60);
        send(put("/exercises/" + bench), "{\"name\": \"Bench\", \"category\": \"CHEST\", \"logType\": \"REPS\"}");

        lastDoneStatus(bench, 204);
    }

    @Test
    void anotherAccountsSetsOfASharedExerciseDoNotCount() throws Exception {
        String all = mvc.perform(get("/exercises").header("Authorization", bearer))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<Number> builtIns = JsonPath.read(all, "$[?(@.builtIn == true)].id");
        long shared = builtIns.get(0).longValue();

        String mine = bearer;
        bearer = signup("someone@example.com");
        long theirWorkout = id(send(post("/workouts"), "{\"name\": \"Theirs\"}"));
        doWorkout(theirWorkout, shared, true, 100);
        bearer = mine;

        lastDoneStatus(shared, 204);
    }

    @Test
    void anotherAccountsExerciseIsNoContent() throws Exception {
        doWorkout(push, bench, true, 60);
        bearer = signup("nosy@example.com");

        lastDoneStatus(bench, 204);
    }

    // --- helpers ---

    // A session of the workout with one set per weight (× 5 reps).
    private void doWorkout(long workoutId, long exerciseId, boolean finish, double... weights) throws Exception {
        long session = id(send(post("/workouts/" + workoutId + "/sessions"), "{}"));
        for (double w : weights) {
            send(post("/sessions/" + session + "/sets?exerciseId=" + exerciseId), "{\"weight\": " + w + ", \"reps\": 5}");
        }
        if (finish) send(post("/sessions/" + session + "/finish"), "{}");
    }

    private String lastDone(long exerciseId) throws Exception {
        return mvc.perform(get("/exercises/" + exerciseId + "/last-done").header("Authorization", bearer))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private void lastDoneStatus(long exerciseId, int expected) throws Exception {
        mvc.perform(get("/exercises/" + exerciseId + "/last-done").header("Authorization", bearer))
            .andExpect(status().is(expected));
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
