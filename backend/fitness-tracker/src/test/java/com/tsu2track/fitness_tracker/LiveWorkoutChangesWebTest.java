package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import com.jayway.jsonpath.JsonPath;

/* Exercises added, replaced or removed during a live workout: Finish sends
   exactly today's list (exerciseIds) and whether the workout itself should
   change from now on (updateWorkout). Full stack, so the fields go through
   JSON as the app sends them. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class LiveWorkoutChangesWebTest {

    @Autowired MockMvc mvc;

    private String bearer;
    private long workoutId;
    private long bench;
    private long row;
    private long dips;

    @BeforeEach
    void setUp() throws Exception {
        bearer = signup("live@example.com");
        workoutId = id(send(post("/workouts"), "{\"name\": \"Upper\"}"));
        bench = id(send(post("/workouts/" + workoutId + "/exercises"), "{\"name\": \"Bench\", \"category\": \"CHEST\"}"));
        row = id(send(post("/workouts/" + workoutId + "/exercises"), "{\"name\": \"Row\", \"category\": \"BACK\"}"));
        dips = id(send(post("/exercises"), "{\"name\": \"Dips\", \"category\": \"CHEST\"}"));
    }

    @Test
    void todayOnlyRecordsTodaysListAndKeepsTheWorkout() throws Exception {
        long session = startAndFinish("{\"exerciseIds\": [" + dips + ", " + row + "], \"updateWorkout\": false}");

        assertThat(names("/sessions/" + session + "/exercises")).containsExactly("Dips", "Row");
        assertThat(names("/workouts/" + workoutId + "/exercises")).containsExactly("Bench", "Row");
    }

    @Test
    void updateWorkoutChangesTheWorkoutFromNowOn() throws Exception {
        long session = startAndFinish("{\"exerciseIds\": [" + dips + ", " + row + "], \"updateWorkout\": true}");

        assertThat(names("/sessions/" + session + "/exercises")).containsExactly("Dips", "Row");
        assertThat(names("/workouts/" + workoutId + "/exercises")).containsExactly("Dips", "Row");
    }

    @Test
    void anotherAccountsExerciseIsNeitherRecordedNorAdded() throws Exception {
        String mine = bearer;
        bearer = signup("other@example.com");
        long theirs = id(send(post("/exercises"), "{\"name\": \"Secret\", \"category\": \"CHEST\"}"));
        bearer = mine;

        long session = startAndFinish("{\"exerciseIds\": [" + theirs + ", " + row + "], \"updateWorkout\": true}");

        assertThat(names("/sessions/" + session + "/exercises")).containsExactly("Row");
        assertThat(names("/workouts/" + workoutId + "/exercises")).containsExactly("Row");
    }

    @Test
    void withoutExerciseIdsFinishWorksAsBefore() throws Exception {
        long session = startAndFinish("{\"orderedExerciseIds\": [" + row + ", " + bench + "]}");

        assertThat(names("/sessions/" + session + "/exercises")).containsExactly("Row", "Bench");
        assertThat(names("/workouts/" + workoutId + "/exercises")).containsExactly("Bench", "Row");
    }

    @Test
    void updateWorkoutWithAnEmptyListLeavesTheWorkoutAlone() throws Exception {
        startAndFinish("{\"exerciseIds\": [], \"updateWorkout\": true}");

        assertThat(names("/workouts/" + workoutId + "/exercises")).containsExactly("Bench", "Row");
    }

    // --- PUT /workouts/{id}/exercise-list: "Update" with nothing logged ---

    @Test
    void exerciseListSetsTheWorkoutsExercisesInOrder() throws Exception {
        mvc.perform(put("/workouts/" + workoutId + "/exercise-list").header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content("{\"exerciseIds\": [" + row + ", " + dips + "]}"))
            .andExpect(status().isNoContent());

        assertThat(names("/workouts/" + workoutId + "/exercises")).containsExactly("Row", "Dips");
    }

    @Test
    void exerciseListSkipsAnotherAccountsExercise() throws Exception {
        String mine = bearer;
        bearer = signup("other2@example.com");
        long theirs = id(send(post("/exercises"), "{\"name\": \"Secret\", \"category\": \"CHEST\"}"));
        bearer = mine;

        mvc.perform(put("/workouts/" + workoutId + "/exercise-list").header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content("{\"exerciseIds\": [" + theirs + ", " + bench + "]}"))
            .andExpect(status().isNoContent());

        assertThat(names("/workouts/" + workoutId + "/exercises")).containsExactly("Bench");
    }

    @Test
    void exerciseListThatWouldEmptyTheWorkoutIsRefused() throws Exception {
        mvc.perform(put("/workouts/" + workoutId + "/exercise-list").header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content("{\"exerciseIds\": [999999]}"))
            .andExpect(status().isBadRequest());

        assertThat(names("/workouts/" + workoutId + "/exercises")).containsExactly("Bench", "Row");
    }

    @Test
    void anotherAccountsWorkoutIsNotFound() throws Exception {
        String mine = bearer;
        bearer = signup("other3@example.com");
        mvc.perform(put("/workouts/" + workoutId + "/exercise-list").header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content("{\"exerciseIds\": [" + row + "]}"))
            .andExpect(status().isNotFound());
        bearer = mine;

        assertThat(names("/workouts/" + workoutId + "/exercises")).containsExactly("Bench", "Row");
    }

    // --- helpers ---

    private long startAndFinish(String finishBody) throws Exception {
        long session = id(send(post("/workouts/" + workoutId + "/sessions"), "{}"));
        send(post("/sessions/" + session + "/finish"), finishBody);
        return session;
    }

    private List<String> names(String url) throws Exception {
        String json = mvc.perform(get(url).header("Authorization", bearer))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$[*].name");
    }

    private String send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request, String body)
            throws Exception {
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
