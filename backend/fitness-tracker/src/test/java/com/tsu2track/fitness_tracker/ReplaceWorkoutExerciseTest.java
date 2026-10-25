package com.tsu2track.fitness_tracker;

import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import com.jayway.jsonpath.JsonPath;

/* Replace exercise (the workout page's ⋮ menu): the new exercise takes the
   old one's place in the workout's order; nothing else moves, and past
   sessions keep what was logged. Full stack. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ReplaceWorkoutExerciseTest {

    private static final String BENCH = "Barbell Bench Press - Medium Grip";

    @Autowired MockMvc mvc;

    private String a;
    private long workout;
    private long press;
    private long fly;
    private long dips;
    private long bench;

    @BeforeEach
    void workoutOfThree() throws Exception {
        a = signup("a@example.com");
        workout = id(send(a, post("/workouts"), "{\"name\": \"Push\"}"));
        press = custom("Press");
        fly = custom("Fly");
        dips = custom("Dips");
        bench = builtInId(BENCH);
    }

    @Test
    void theNewOneTakesTheOldOnesPlace() throws Exception {
        call(a, put(replace(fly, bench))).andExpect(status().isOk());
        call(a, get("/workouts/" + workout + "/exercises"))
            .andExpect(jsonPath("$[*].name", contains("Press", BENCH, "Dips")));
        // The old one is only off this workout, not gone.
        call(a, get("/exercises/" + fly)).andExpect(jsonPath("$.deleted").value(false));
    }

    @Test
    void notIfTheNewOneIsAlreadyInTheWorkout() throws Exception {
        call(a, put(replace(fly, dips))).andExpect(status().isConflict());
        call(a, put(replace(fly, fly))).andExpect(status().isConflict());
        call(a, get("/workouts/" + workout + "/exercises"))
            .andExpect(jsonPath("$[*].name", contains("Press", "Fly", "Dips")));
    }

    @Test
    void notFoundWhenTheOldOneIsNotInTheWorkoutOrTheNewOneIsMissing() throws Exception {
        call(a, put(replace(bench, fly))).andExpect(status().isNotFound());
        call(a, put(replace(fly, 999999))).andExpect(status().isNotFound());
        long gone = id(send(a, post("/exercises"), "{\"name\": \"Gone\", \"category\": \"CHEST\"}"));
        call(a, delete("/exercises/" + gone)).andExpect(status().isOk());
        call(a, put(replace(fly, gone))).andExpect(status().isNotFound());
        long other = id(send(a, post("/workouts"), "{\"name\": \"Pull\"}"));
        call(a, put("/workouts/" + other + "/exercises/" + fly + "/replace/" + bench)).andExpect(status().isNotFound());
    }

    @Test
    void anotherAccountsExerciseCannotComeIn() throws Exception {
        String b = signup("b@example.com");
        long theirs = id(send(b, post("/exercises"), "{\"name\": \"Theirs\", \"category\": \"CHEST\"}"));
        call(a, put(replace(fly, theirs))).andExpect(status().isNotFound());
        call(b, put(replace(fly, bench))).andExpect(status().isNotFound());
        call(a, get("/workouts/" + workout + "/exercises"))
            .andExpect(jsonPath("$[*].name", contains("Press", "Fly", "Dips")));
    }

    @Test
    void pastSessionsKeepWhatWasLogged() throws Exception {
        long session = id(send(a, post("/workouts/" + workout + "/sessions"), null));
        send(a, post("/sessions/" + session + "/sets?exerciseId=" + fly), "{\"weight\": 20, \"reps\": 10}");
        call(a, post("/sessions/" + session + "/finish")).andExpect(status().isOk());

        call(a, put(replace(fly, bench))).andExpect(status().isOk());
        call(a, get("/sessions/" + session + "/exercises"))
            .andExpect(jsonPath("$[*].name", contains("Press", "Fly", "Dips")));
    }

    private String replace(long from, long to) {
        return "/workouts/" + workout + "/exercises/" + from + "/replace/" + to;
    }

    private long custom(String name) throws Exception {
        return id(send(a, post("/workouts/" + workout + "/exercises"),
            "{\"name\": \"" + name + "\", \"category\": \"CHEST\"}"));
    }

    private long builtInId(String name) throws Exception {
        String json = call(a, get("/exercises")).andReturn().getResponse().getContentAsString();
        List<Number> ids = JsonPath.read(json, "$[?(@.builtIn == true && @.name == '" + name + "')].id");
        return ids.get(0).longValue();
    }

    private String signup(String email) throws Exception {
        String json = mvc.perform(post("/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\": \"" + email + "\", \"password\": \"password123\", \"inviteCode\": \""
                    + TestAuth.INVITE_CODE + "\"}"))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return "Bearer " + JsonPath.read(json, "$.token");
    }

    private ResultActions call(String bearer, MockHttpServletRequestBuilder request) throws Exception {
        return send(bearer, request, null);
    }

    private ResultActions send(String bearer, MockHttpServletRequestBuilder request, String body) throws Exception {
        request.header("Authorization", bearer);
        if (body != null) request.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(request);
    }

    private static long id(ResultActions result) throws Exception {
        String json = result.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }
}
