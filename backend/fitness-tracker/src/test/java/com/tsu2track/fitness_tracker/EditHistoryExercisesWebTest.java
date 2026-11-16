package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import com.jayway.jsonpath.JsonPath;

/* Editing history, whole exercises: a finished workout's exercises can be
   added (POST /sessions/{id}/exercises), removed (DELETE
   /sessions/{id}/exercises/{exerciseId}) and replaced (PUT
   …/{exerciseId}/replace/{replacementId}), for that day only: the
   workout's own list stays. Not for a workout still in progress. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class EditHistoryExercisesWebTest {

    @Autowired MockMvc mvc;

    private String bearer;
    private long push;
    private long bench;
    private long press;
    private long fly;
    private long session;

    @BeforeEach
    void setUp() throws Exception {
        bearer = signup("pastexercises@example.com");
        push = id(send(post("/workouts"), "{\"name\": \"Push\"}"));
        bench = id(send(post("/workouts/" + push + "/exercises"), "{\"name\": \"Bench\", \"category\": \"CHEST\"}"));
        press = id(send(post("/workouts/" + push + "/exercises"), "{\"name\": \"Press\", \"category\": \"SHOULDERS\"}"));
        fly = id(send(post("/exercises"), "{\"name\": \"Fly\", \"category\": \"CHEST\"}"));
        session = finishedSession(80, 60);
    }

    // A finished Push: two bench sets, one press set.
    private long finishedSession(int benchKg, int pressKg) throws Exception {
        long s = id(send(post("/workouts/" + push + "/sessions"), "{}"));
        logSet(s, bench, benchKg);
        logSet(s, bench, benchKg);
        logSet(s, press, pressKg);
        send(post("/sessions/" + s + "/finish"), "{}");
        return s;
    }

    @Test
    void anAddedExerciseGoesAtTheEndAndTakesSets() throws Exception {
        String json = send(post("/sessions/" + session + "/exercises"), "{\"exerciseIds\": [" + fly + "]}");
        assertThat(exerciseIds(json)).containsExactly(bench, press, fly);
        assertThat(exercisesOf(session)).containsExactly(bench, press, fly);

        logSet(session, fly, 20);
        assertThat(setsOf(session)).containsExactly("80.0x5", "80.0x5", "60.0x5", "20.0x5");
        // That day only: the workout's own list stays.
        assertThat(workoutList()).containsExactly(bench, press);
    }

    @Test
    void severalCanBeAddedInOrder() throws Exception {
        long dip = id(send(post("/exercises"), "{\"name\": \"Dip\", \"category\": \"CHEST\"}"));
        send(post("/sessions/" + session + "/exercises"), "{\"exerciseIds\": [" + dip + ", " + fly + ", " + dip + "]}");
        assertThat(exercisesOf(session)).containsExactly(bench, press, dip, fly);
    }

    @Test
    void anAddedExerciseIsLoggedAsItIsNow() throws Exception {
        send(put("/exercises/" + fly), "{\"name\": \"Fly\", \"category\": \"CHEST\", \"logType\": \"REPS\"}");
        String json = send(post("/sessions/" + session + "/exercises"), "{\"exerciseIds\": [" + fly + "]}");
        assertThat((String) JsonPath.read(json, "$[2].logType")).isEqualTo("REPS");
        String set = send(post("/sessions/" + session + "/sets?exerciseId=" + fly), "{\"reps\": 12}");
        assertThat((String) JsonPath.read(set, "$.logType")).isEqualTo("REPS");
    }

    @Test
    void addingOneAlreadyInItOrNothingIsRefused() throws Exception {
        call(post("/sessions/" + session + "/exercises"), "{\"exerciseIds\": [" + fly + ", " + bench + "]}")
            .andExpect(status().isConflict());
        call(post("/sessions/" + session + "/exercises"), "{\"exerciseIds\": []}").andExpect(status().isBadRequest());
        call(post("/sessions/" + session + "/exercises"), "{\"exerciseIds\": [999999]}").andExpect(status().isNotFound());
        assertThat(exercisesOf(session)).containsExactly(bench, press);
    }

    @Test
    void removingAnExerciseDeletesItsSetsInThatWorkoutOnly() throws Exception {
        long other = finishedSession(85, 62);
        String json = send(delete("/sessions/" + session + "/exercises/" + bench), null);
        assertThat(exerciseIds(json)).containsExactly(press);
        assertThat((Integer) JsonPath.read(json, "$[0].position")).isEqualTo(0);
        assertThat(setsOf(session)).containsExactly("60.0x5");
        // the other workout keeps its bench sets, and the workout its list
        assertThat(setsOf(other)).containsExactly("85.0x5", "85.0x5", "62.0x5");
        assertThat(workoutList()).containsExactly(bench, press);
        String history = getJson("/exercises/" + bench + "/history/count");
        assertThat((Integer) JsonPath.read(history, "$.sets")).isEqualTo(2);
    }

    @Test
    void theLastExerciseCantBeRemoved() throws Exception {
        send(delete("/sessions/" + session + "/exercises/" + bench), null);
        call(delete("/sessions/" + session + "/exercises/" + press), null).andExpect(status().isConflict());
        assertThat(exercisesOf(session)).containsExactly(press);
        assertThat(setsOf(session)).containsExactly("60.0x5");
    }

    @Test
    void removingOneNotInItIsNotFound() throws Exception {
        call(delete("/sessions/" + session + "/exercises/" + fly), null).andExpect(status().isNotFound());
        assertThat(exercisesOf(session)).containsExactly(bench, press);
    }

    @Test
    void aReplacementTakesThePlaceAndTheOldSetsGo() throws Exception {
        String json = send(put("/sessions/" + session + "/exercises/" + bench + "/replace/" + fly), null);
        assertThat(exerciseIds(json)).containsExactly(fly, press);
        assertThat((String) JsonPath.read(json, "$[0].name")).isEqualTo("Fly");
        assertThat(setsOf(session)).containsExactly("60.0x5");
        logSet(session, fly, 22);
        assertThat(setsOf(session)).containsExactly("60.0x5", "22.0x5");
        assertThat(workoutList()).containsExactly(bench, press);
    }

    @Test
    void replacingWithOneAlreadyInItIsRefused() throws Exception {
        call(put("/sessions/" + session + "/exercises/" + bench + "/replace/" + press), null)
            .andExpect(status().isConflict());
        call(put("/sessions/" + session + "/exercises/" + bench + "/replace/" + bench), null)
            .andExpect(status().isConflict());
        call(put("/sessions/" + session + "/exercises/" + fly + "/replace/" + bench), null)
            .andExpect(status().isNotFound());
        assertThat(exercisesOf(session)).containsExactly(bench, press);
        assertThat(setsOf(session)).hasSize(3);
    }

    @Test
    void notForAWorkoutInProgress() throws Exception {
        long live = id(send(post("/workouts/" + push + "/sessions"), "{}"));
        logSet(live, bench, 90);
        call(post("/sessions/" + live + "/exercises"), "{\"exerciseIds\": [" + fly + "]}").andExpect(status().isConflict());
        call(delete("/sessions/" + live + "/exercises/" + bench), null).andExpect(status().isConflict());
        call(put("/sessions/" + live + "/exercises/" + bench + "/replace/" + fly), null).andExpect(status().isConflict());
        assertThat(setsOf(live)).containsExactly("90.0x5");
    }

    @Test
    void anotherAccountCantChangeIt() throws Exception {
        String mine = bearer;
        bearer = signup("nosy4@example.com");
        long theirs = id(send(post("/exercises"), "{\"name\": \"Theirs\", \"category\": \"CHEST\"}"));
        call(post("/sessions/" + session + "/exercises"), "{\"exerciseIds\": [" + theirs + "]}").andExpect(status().isNotFound());
        call(delete("/sessions/" + session + "/exercises/" + bench), null).andExpect(status().isNotFound());
        call(put("/sessions/" + session + "/exercises/" + bench + "/replace/" + theirs), null).andExpect(status().isNotFound());
        bearer = mine;
        // nor can their exercise go into mine
        call(post("/sessions/" + session + "/exercises"), "{\"exerciseIds\": [" + theirs + "]}").andExpect(status().isNotFound());
        call(put("/sessions/" + session + "/exercises/" + bench + "/replace/" + theirs), null).andExpect(status().isNotFound());
        assertThat(exercisesOf(session)).containsExactly(bench, press);
        assertThat(setsOf(session)).hasSize(3);
    }

    // --- helpers ---

    private void logSet(long sessionId, long exerciseId, int kg) throws Exception {
        send(post("/sessions/" + sessionId + "/sets?exerciseId=" + exerciseId), "{\"weight\": " + kg + ", \"reps\": 5}");
    }

    private List<Long> exercisesOf(long sessionId) throws Exception {
        return exerciseIds(getJson("/sessions/" + sessionId + "/exercises"));
    }

    private List<Long> workoutList() throws Exception {
        List<Number> ids = JsonPath.read(getJson("/workouts/" + push + "/exercises"), "$[*].id");
        return ids.stream().map(Number::longValue).toList();
    }

    private static List<Long> exerciseIds(String json) {
        List<Number> ids = JsonPath.read(json, "$[*].exerciseId");
        return ids.stream().map(Number::longValue).toList();
    }

    private List<String> setsOf(long sessionId) throws Exception {
        String json = getJson("/sessions/" + sessionId + "/sets");
        List<Number> weights = JsonPath.read(json, "$[*].weight");
        List<Integer> reps = JsonPath.read(json, "$[*].reps");
        return java.util.stream.IntStream.range(0, weights.size())
            .mapToObj(i -> weights.get(i).doubleValue() + "x" + reps.get(i)).toList();
    }

    private String getJson(String url) throws Exception {
        return mvc.perform(get(url).header("Authorization", bearer))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private ResultActions call(MockHttpServletRequestBuilder request, String body) throws Exception {
        request.header("Authorization", bearer);
        if (body != null) request.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(request);
    }

    private String send(MockHttpServletRequestBuilder request, String body) throws Exception {
        return call(request, body).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
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
