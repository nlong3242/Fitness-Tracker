package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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

/* One workout in progress per account, whatever the device: starting
   another while one is open answers 409 with the open one (so the app can
   offer to discard it or go to it). Finishing or discarding it frees the
   way; other accounts aren't affected. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class OneWorkoutInProgressWebTest {

    @Autowired MockMvc mvc;

    private String bearer;
    private long upper;
    private long lower;

    @BeforeEach
    void setUp() throws Exception {
        bearer = signup("one@example.com");
        upper = createWorkout(bearer, "Upper");
        lower = createWorkout(bearer, "Lower");
    }

    @Test
    void aSecondWorkoutIsRefusedWithTheOpenOne() throws Exception {
        long open = id(start(bearer, upper).andExpect(status().isOk()));
        start(bearer, lower)
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.id").value(open))
            .andExpect(jsonPath("$.workoutId").value(upper))
            .andExpect(jsonPath("$.finished").value(false));
    }

    @Test
    void theSameWorkoutTwiceIsRefusedToo() throws Exception {
        long open = id(start(bearer, upper).andExpect(status().isOk()));
        start(bearer, upper).andExpect(status().isConflict()).andExpect(jsonPath("$.id").value(open));
    }

    @Test
    void finishingFreesTheWay() throws Exception {
        long open = id(start(bearer, upper));
        mvc.perform(post("/sessions/" + open + "/finish").header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().is2xxSuccessful());
        start(bearer, lower).andExpect(status().isOk());
    }

    @Test
    void discardingFreesTheWay() throws Exception {
        long open = id(start(bearer, upper));
        mvc.perform(delete("/sessions/" + open).header("Authorization", bearer))
            .andExpect(status().is2xxSuccessful());
        start(bearer, lower).andExpect(status().isOk());
    }

    @Test
    void anotherAccountsWorkoutDoesNotCount() throws Exception {
        String other = signup("other@example.com");
        start(other, createWorkout(other, "Theirs")).andExpect(status().isOk());
        start(bearer, upper).andExpect(status().isOk());
    }

    // ----- helpers -----

    private ResultActions start(String auth, long workout) throws Exception {
        return mvc.perform(post("/workouts/" + workout + "/sessions").header("Authorization", auth));
    }

    private long id(ResultActions result) throws Exception {
        return ((Number) JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.id")).longValue();
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
        assertThat(json).contains("token");
        return "Bearer " + JsonPath.read(json, "$.token");
    }
}
