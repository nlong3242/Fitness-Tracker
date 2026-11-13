package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

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

/* The workout stopwatch (V19): a session starts at the time the app sends
   (Start tapped), finishes now or at the time sent (auto-end), and its
   duration is the difference. The profile says whether the live workout
   shows it. Full stack, so the times go through JSON as the app sends them. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class WorkoutStopwatchWebTest {

    @Autowired MockMvc mvc;

    private String bearer;
    private long workoutId;

    @BeforeEach
    void setUp() throws Exception {
        bearer = signup("long@example.com");
        String json = mvc.perform(post("/workouts").header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\": \"Upper\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        workoutId = ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    // ----- Start -----

    @Test
    void startsWhenStartWasTapped() throws Exception {
        Instant tapped = Instant.now().minus(20, ChronoUnit.MINUTES).truncatedTo(ChronoUnit.MILLIS);
        String json = create("{\"startedAt\": \"" + tapped + "\"}");
        assertThat(Instant.parse(JsonPath.read(json, "$.startedAt"))).isEqualTo(tapped);
        assertThat((Object) JsonPath.read(json, "$.finishedAt")).isNull();
        assertThat((Object) JsonPath.read(json, "$.durationSeconds")).isNull();
    }

    @Test
    void withoutAStartTimeItStartsNow() throws Exception {
        Instant before = Instant.now().minusSeconds(1);
        assertThat(startedAt(create(null))).isAfter(before);
        assertThat(startedAt(create("{}"))).isAfter(before);
    }

    @Test
    void anUnbelievableStartTimeIsReplacedByNow() throws Exception {
        Instant before = Instant.now().minusSeconds(1);
        String future = Instant.now().plus(1, ChronoUnit.HOURS).toString();
        String twoDaysAgo = Instant.now().minus(2, ChronoUnit.DAYS).toString();
        assertThat(startedAt(create("{\"startedAt\": \"" + future + "\"}"))).isAfter(before).isBefore(Instant.now().plusSeconds(1));
        assertThat(startedAt(create("{\"startedAt\": \"" + twoDaysAgo + "\"}"))).isAfter(before);
    }

    // ----- Finish -----

    @Test
    void finishingRecordsTheEndAndTheDuration() throws Exception {
        Instant tapped = Instant.now().minus(45, ChronoUnit.MINUTES);
        long id = id(create("{\"startedAt\": \"" + tapped + "\"}"));
        String json = finish(id, "{}").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        Instant finished = Instant.parse(JsonPath.read(json, "$.finishedAt"));
        assertThat(Duration.between(finished, Instant.now()).abs()).isLessThan(Duration.ofSeconds(5));
        long seconds = ((Number) JsonPath.read(json, "$.durationSeconds")).longValue();
        assertThat(seconds).isBetween(45L * 60 - 1, 45L * 60 + 5);
    }

    @Test
    void autoEndFinishesAtTheLastActivity() throws Exception {
        Instant tapped = Instant.now().minus(6, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS);
        Instant lastSet = tapped.plus(50, ChronoUnit.MINUTES);
        long id = id(create("{\"startedAt\": \"" + tapped + "\"}"));
        finish(id, "{\"finishedAt\": \"" + lastSet + "\"}")
            .andExpect(jsonPath("$.durationSeconds").value(50 * 60));
    }

    @Test
    void anEndOutsideTheWorkoutIsKeptInside() throws Exception {
        Instant tapped = Instant.now().minus(30, ChronoUnit.MINUTES).truncatedTo(ChronoUnit.SECONDS);
        long before = id(create("{\"startedAt\": \"" + tapped + "\"}"));
        finish(before, "{\"finishedAt\": \"" + tapped.minus(1, ChronoUnit.HOURS) + "\"}")
            .andExpect(jsonPath("$.durationSeconds").value(0));

        long later = id(create("{\"startedAt\": \"" + tapped + "\"}"));
        String json = finish(later, "{\"finishedAt\": \"" + Instant.now().plus(1, ChronoUnit.HOURS) + "\"}")
            .andReturn().getResponse().getContentAsString();
        assertThat(((Number) JsonPath.read(json, "$.durationSeconds")).longValue()).isBetween(30L * 60 - 1, 30L * 60 + 5);
    }

    @Test
    void finishingTwiceKeepsTheFirstEnd() throws Exception {
        Instant tapped = Instant.now().minus(6, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS);
        long id = id(create("{\"startedAt\": \"" + tapped + "\"}"));
        finish(id, "{\"finishedAt\": \"" + tapped.plus(40, ChronoUnit.MINUTES) + "\"}");
        finish(id, "{}").andExpect(jsonPath("$.durationSeconds").value(40 * 60));
    }

    @Test
    void pastSessionsAndTheUnfinishedOneCarryTheTimes() throws Exception {
        Instant tapped = Instant.now().minus(1, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS);
        long done = id(create("{\"startedAt\": \"" + tapped + "\"}"));
        finish(done, "{\"finishedAt\": \"" + tapped.plus(55, ChronoUnit.MINUTES) + "\"}");
        mvc.perform(get("/workouts/" + workoutId + "/sessions").header("Authorization", bearer))
            .andExpect(jsonPath("$.content[0].durationSeconds").value(55 * 60));

        Instant open = Instant.now().minus(5, ChronoUnit.MINUTES).truncatedTo(ChronoUnit.SECONDS);
        create("{\"startedAt\": \"" + open + "\"}");
        String json = mvc.perform(get("/sessions/unfinished").header("Authorization", bearer))
            .andReturn().getResponse().getContentAsString();
        assertThat(Instant.parse(JsonPath.read(json, "$.startedAt"))).isEqualTo(open);
    }

    // ----- Show it or not (Settings) -----

    @Test
    void theStopwatchIsShownUntilTurnedOff() throws Exception {
        saveProfile();
        mvc.perform(get("/profile").header("Authorization", bearer))
            .andExpect(jsonPath("$.showWorkoutTimer").value(true));

        setShown("{\"show\": false}").andExpect(status().isOk()).andExpect(jsonPath("$.showWorkoutTimer").value(false));
        mvc.perform(get("/profile").header("Authorization", bearer))
            .andExpect(jsonPath("$.showWorkoutTimer").value(false));

        // Saving the profile form or the rest time leaves it alone.
        saveProfile().andExpect(jsonPath("$.showWorkoutTimer").value(false));
        mvc.perform(put("/profile/rest-seconds").header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content("{\"seconds\": 90}"))
            .andExpect(jsonPath("$.showWorkoutTimer").value(false));

        setShown("{\"show\": true}").andExpect(jsonPath("$.showWorkoutTimer").value(true));
    }

    @Test
    void showingItNeedsAChoiceAndAProfile() throws Exception {
        setShown("{\"show\": false}").andExpect(status().isNotFound());
        saveProfile();
        setShown("{}")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors[0].field").value("show"));
    }

    // ----- helpers -----

    private String create(String body) throws Exception {
        var request = post("/workouts/" + workoutId + "/sessions").header("Authorization", bearer);
        if (body != null) request = request.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private ResultActions finish(long sessionId, String body) throws Exception {
        return mvc.perform(post("/sessions/" + sessionId + "/finish").header("Authorization", bearer)
            .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions saveProfile() throws Exception {
        return mvc.perform(put("/profile").header("Authorization", bearer)
            .contentType(MediaType.APPLICATION_JSON).content("{\"name\": \"Long\"}"));
    }

    private ResultActions setShown(String body) throws Exception {
        return mvc.perform(put("/profile/workout-timer").header("Authorization", bearer)
            .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static long id(String json) {
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private static Instant startedAt(String json) {
        return Instant.parse(JsonPath.read(json, "$.startedAt"));
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
