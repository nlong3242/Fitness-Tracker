package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
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

/* Editing history: a finished workout's sets can be added, changed and
   deleted like a live one's (POST /sessions/{id}/sets, PUT and DELETE
   /sets/{id}). Only its own exercises, as they were logged (the finish
   snapshot's type); it stays finished, with its times, even with no sets
   left. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class EditHistoryWebTest {

    @Autowired MockMvc mvc;
    @Autowired SessionRepository sessionRepository;

    private String bearer;
    private long push;
    private long bench;
    private long fly;
    private long session;
    private long firstSet;

    @BeforeEach
    void setUp() throws Exception {
        bearer = signup("history@example.com");
        push = id(send(post("/workouts"), "{\"name\": \"Push\"}"));
        bench = id(send(post("/workouts/" + push + "/exercises"), "{\"name\": \"Bench\", \"category\": \"CHEST\"}"));
        fly = id(send(post("/exercises"), "{\"name\": \"Fly\", \"category\": \"CHEST\"}"));
        session = id(send(post("/workouts/" + push + "/sessions"), "{}"));
        firstSet = id(send(post("/sessions/" + session + "/sets?exerciseId=" + bench), "{\"weight\": 80, \"reps\": 5}"));
        send(post("/sessions/" + session + "/sets?exerciseId=" + bench), "{\"weight\": 80, \"reps\": 5}");
        send(post("/sessions/" + session + "/finish"), "{}");
    }

    @Test
    void aFinishedSetCanBeChanged() throws Exception {
        String json = send(put("/sets/" + firstSet), "{\"weight\": 82.5, \"reps\": 5}");
        assertThat(((Number) JsonPath.read(json, "$.weight")).doubleValue()).isEqualTo(82.5);
        assertThat(setsOf(session)).containsExactly("82.5x5", "80.0x5");
    }

    @Test
    void aSetCanBeAddedToAFinishedWorkout() throws Exception {
        send(post("/sessions/" + session + "/sets?exerciseId=" + bench), "{\"weight\": 75, \"reps\": 8}");
        assertThat(setsOf(session)).containsExactly("80.0x5", "80.0x5", "75.0x8");
        // and it counts in the exercise's history
        String history = getJson("/exercises/" + bench + "/history/count");
        assertThat((Integer) JsonPath.read(history, "$.sets")).isEqualTo(3);
    }

    @Test
    void aFinishedSetCanBeDeleted() throws Exception {
        mvc.perform(delete("/sets/" + firstSet).header("Authorization", bearer)).andExpect(status().isOk());
        assertThat(setsOf(session)).containsExactly("80.0x5");
    }

    @Test
    void deletingEverySetKeepsTheWorkout() throws Exception {
        String sets = getJson("/sessions/" + session + "/sets");
        for (Number setId : JsonPath.<List<Number>>read(sets, "$[*].id")) {
            mvc.perform(delete("/sets/" + setId).header("Authorization", bearer)).andExpect(status().isOk());
        }
        assertThat(setsOf(session)).isEmpty();
        Session kept = sessionRepository.findById(session).orElseThrow();
        assertThat(kept.isFinished()).isTrue();
        // still in Past sessions, still listing the bench
        String page = getJson("/workouts/" + push + "/sessions");
        assertThat((List<?>) JsonPath.read(page, "$.content")).hasSize(1);
        String exercises = getJson("/sessions/" + session + "/exercises");
        assertThat(JsonPath.<List<Number>>read(exercises, "$[*].exerciseId"))
            .extracting(Number::longValue).containsExactly(bench);
    }

    @Test
    void editingLeavesTheWorkoutsTimesAlone() throws Exception {
        Session before = sessionRepository.findById(session).orElseThrow();
        Instant activity = before.getLastActivityAt();
        Instant finishedAt = before.getFinishedAt();
        Instant startedAt = before.getStartedAt();

        send(put("/sets/" + firstSet), "{\"weight\": 85, \"reps\": 5}");
        send(post("/sessions/" + session + "/sets?exerciseId=" + bench), "{\"weight\": 70, \"reps\": 10}");
        mvc.perform(delete("/sets/" + firstSet).header("Authorization", bearer)).andExpect(status().isOk());

        Session after = sessionRepository.findById(session).orElseThrow();
        assertThat(after.isFinished()).isTrue();
        assertThat(after.getLastActivityAt()).isEqualTo(activity);
        assertThat(after.getFinishedAt()).isEqualTo(finishedAt);
        assertThat(after.getStartedAt()).isEqualTo(startedAt);
    }

    @Test
    void anExerciseNotInTheWorkoutCantBeAdded() throws Exception {
        mvc.perform(post("/sessions/" + session + "/sets?exerciseId=" + fly).header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content("{\"weight\": 20, \"reps\": 10}"))
            .andExpect(status().isConflict());
        assertThat(setsOf(session)).hasSize(2);
    }

    @Test
    void anAddedSetUsesTheTypeTheWorkoutWasLoggedWith() throws Exception {
        // Bench is now logged as reps only; this workout was weight × reps.
        send(put("/exercises/" + bench), "{\"name\": \"Bench\", \"category\": \"CHEST\", \"logType\": \"REPS\"}");

        String json = send(post("/sessions/" + session + "/sets?exerciseId=" + bench), "{\"weight\": 90, \"reps\": 3}");
        assertThat((String) JsonPath.read(json, "$.logType")).isEqualTo("WEIGHT_REPS");
        assertThat(((Number) JsonPath.read(json, "$.weight")).doubleValue()).isEqualTo(90.0);
        // reps alone isn't a weight × reps set
        mvc.perform(post("/sessions/" + session + "/sets?exerciseId=" + bench).header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content("{\"reps\": 3}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void anotherAccountCantEditIt() throws Exception {
        // (Another account's set or session answers an empty 200, as for a
        // live workout: a known, left-alone quirk. What matters is nothing changes.)
        String mine = bearer;
        bearer = signup("nosy3@example.com");
        mvc.perform(put("/sets/" + firstSet).header("Authorization", bearer)
            .contentType(MediaType.APPLICATION_JSON).content("{\"weight\": 1, \"reps\": 1}"));
        mvc.perform(post("/sessions/" + session + "/sets?exerciseId=" + bench).header("Authorization", bearer)
            .contentType(MediaType.APPLICATION_JSON).content("{\"weight\": 1, \"reps\": 1}"));
        mvc.perform(delete("/sets/" + firstSet).header("Authorization", bearer));
        bearer = mine;
        assertThat(setsOf(session)).containsExactly("80.0x5", "80.0x5");
    }

    // --- helpers ---

    private List<String> setsOf(long sessionId) {
        return sessionRepository.findById(sessionId).isEmpty() ? List.of() : setsJson(sessionId);
    }

    private List<String> setsJson(long sessionId) {
        try {
            String json = getJson("/sessions/" + sessionId + "/sets");
            List<Number> weights = JsonPath.read(json, "$[*].weight");
            List<Integer> reps = JsonPath.read(json, "$[*].reps");
            return java.util.stream.IntStream.range(0, weights.size())
                .mapToObj(i -> weights.get(i).doubleValue() + "x" + reps.get(i)).toList();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
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
