package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import com.jayway.jsonpath.JsonPath;

/* A session remembers the calendar plan it was started from (V20), so the
   app can tick that plan off at Finish even after the workout was left and
   resumed elsewhere. Only the user's own plan for that same workout is
   kept; anything else is ignored rather than refused (the workout still
   starts). */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class SessionPlanLinkWebTest {

    @Autowired MockMvc mvc;

    private String bearer;
    private long workoutId;

    @BeforeEach
    void setUp() throws Exception {
        bearer = signup("plans@example.com");
        workoutId = createWorkout(bearer, "Upper");
    }

    @Test
    void keepsThePlanItWasStartedFrom() throws Exception {
        long planId = plan(bearer, workoutId);
        String json = start(bearer, workoutId, "{\"scheduledWorkoutId\": " + planId + "}");
        assertThat(((Number) JsonPath.read(json, "$.scheduledWorkoutId")).longValue()).isEqualTo(planId);
    }

    @Test
    void theInProgressWorkoutCarriesItForAResume() throws Exception {
        long planId = plan(bearer, workoutId);
        String started = start(bearer, workoutId, "{\"scheduledWorkoutId\": " + planId + "}");
        long sessionId = ((Number) JsonPath.read(started, "$.id")).longValue();
        mvc.perform(post("/sessions/" + sessionId + "/sets?exerciseId=" + firstExercise())
                .header("Authorization", bearer).contentType(MediaType.APPLICATION_JSON)
                .content("{\"weight\": 50, \"reps\": 5}"))
            .andExpect(status().isOk());
        String unfinished = mvc.perform(get("/sessions/unfinished").header("Authorization", bearer))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(((Number) JsonPath.read(unfinished, "$.scheduledWorkoutId")).longValue()).isEqualTo(planId);
    }

    @Test
    void startedOnItsOwnHasNoPlan() throws Exception {
        String first = start(bearer, workoutId, null);
        assertThat((Object) JsonPath.read(first, "$.scheduledWorkoutId")).isNull();
        mvc.perform(delete("/sessions/" + JsonPath.read(first, "$.id")).header("Authorization", bearer))
            .andExpect(status().is2xxSuccessful());
        assertThat((Object) JsonPath.read(start(bearer, workoutId, "{}"), "$.scheduledWorkoutId")).isNull();
    }

    @Test
    void anotherWorkoutsPlanIsIgnored() throws Exception {
        long other = createWorkout(bearer, "Lower");
        long otherPlan = plan(bearer, other);
        String json = start(bearer, workoutId, "{\"scheduledWorkoutId\": " + otherPlan + "}");
        assertThat((Object) JsonPath.read(json, "$.scheduledWorkoutId")).isNull();
    }

    @Test
    void someoneElsesPlanIsIgnored() throws Exception {
        String stranger = signup("stranger@example.com");
        long theirPlan = plan(stranger, createWorkout(stranger, "Theirs"));
        String json = start(bearer, workoutId, "{\"scheduledWorkoutId\": " + theirPlan + "}");
        assertThat((Object) JsonPath.read(json, "$.scheduledWorkoutId")).isNull();
    }

    @Test
    void aPlanThatDoesNotExistIsIgnored() throws Exception {
        String json = start(bearer, workoutId, "{\"scheduledWorkoutId\": 999999}");
        assertThat((Object) JsonPath.read(json, "$.scheduledWorkoutId")).isNull();
    }

    // ----- helpers -----

    private long firstExercise() throws Exception {
        String all = mvc.perform(get("/exercises").header("Authorization", bearer))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        long exerciseId = ((Number) JsonPath.read(all, "$[0].id")).longValue();
        mvc.perform(post("/workouts/" + workoutId + "/exercises/" + exerciseId + "/link").header("Authorization", bearer))
            .andExpect(status().isOk());
        return exerciseId;
    }

    private String start(String auth, long workout, String body) throws Exception {
        var request = post("/workouts/" + workout + "/sessions").header("Authorization", auth);
        if (body != null) request = request.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private long plan(String auth, long workout) throws Exception {
        String json = mvc.perform(post("/scheduled-workouts").header("Authorization", auth)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"date\": \"" + LocalDate.now() + "\", \"workoutId\": " + workout + "}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private long createWorkout(String auth, String name) throws Exception {
        String json = mvc.perform(post("/workouts").header("Authorization", auth)
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\": \"" + name + "\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
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
