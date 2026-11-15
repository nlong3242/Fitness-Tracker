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

/* Reset a workout (GET /workouts/{id}/history/count, DELETE
   /workouts/{id}/history): every finished session of it goes with its sets,
   each calendar entry undone; a session in progress, other workouts, the
   workout itself and its exercises stay. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ResetWorkoutWebTest {

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
        bearer = signup("resetworkout@example.com");
        push = id(send(post("/workouts"), "{\"name\": \"Push\"}"));
        upper = id(send(post("/workouts"), "{\"name\": \"Upper\"}"));
        bench = id(send(post("/workouts/" + push + "/exercises"), "{\"name\": \"Bench\", \"category\": \"CHEST\"}"));
        fly = id(send(post("/exercises"), "{\"name\": \"Fly\", \"category\": \"CHEST\"}"));
    }

    @Test
    void countsFinishedSessionsAndTheirSets() throws Exception {
        doWorkout(push, true, bench, 60, 70, fly, 20);
        doWorkout(push, true, bench, 80);
        doWorkout(upper, true, bench, 90);  // another workout: not counted
        doWorkout(push, false, bench, 100); // in progress: not counted

        String json = getJson("/workouts/" + push + "/history/count");
        assertThat((Integer) JsonPath.read(json, "$.sets")).isEqualTo(4);
        assertThat((Integer) JsonPath.read(json, "$.sessions")).isEqualTo(2);
    }

    @Test
    void deletesItsFinishedSessionsAndKeepsTheWorkout() throws Exception {
        long first = doWorkout(push, true, bench, 60);
        long second = doWorkout(push, true, bench, 70, fly, 20);

        String json = reset(push);
        assertThat((Integer) JsonPath.read(json, "$.sets")).isEqualTo(3);
        assertThat((Integer) JsonPath.read(json, "$.sessions")).isEqualTo(2);

        assertThat(sessionRepository.findById(first)).isEmpty();
        assertThat(sessionRepository.findById(second)).isEmpty();
        String page = getJson("/workouts/" + push + "/sessions");
        assertThat((List<?>) JsonPath.read(page, "$.content")).isEmpty();
        // the workout and its exercises stay
        String exercises = getJson("/workouts/" + push + "/exercises");
        List<Number> ids = JsonPath.read(exercises, "$[*].id");
        assertThat(ids).extracting(Number::longValue).containsExactly(bench);
        assertThat((Integer) JsonPath.read(getJson("/workouts/" + push + "/history/count"), "$.sessions")).isZero();
    }

    @Test
    void otherWorkoutsAndASessionInProgressStay() throws Exception {
        doWorkout(push, true, bench, 60);
        long other = doWorkout(upper, true, bench, 80);
        long open = doWorkout(push, false, bench, 90);

        reset(push);

        assertThat(sessionRepository.findById(other)).isPresent();
        String sets = getJson("/sessions/" + open + "/sets");
        assertThat((List<?>) JsonPath.read(sets, "$")).hasSize(1);
        String history = getJson("/exercises/" + bench + "/history/count");
        assertThat((Integer) JsonPath.read(history, "$.sets")).isEqualTo(1);
    }

    @Test
    void itsCalendarEntriesAreUndone() throws Exception {
        LocalDate today = LocalDate.now();
        long ruleDay = doWorkout(push, true, bench, 60);
        long planned = id(send(post("/scheduled-workouts"), "{\"date\": \"" + today + "\", \"workoutId\": " + push
            + ", \"status\": \"COMPLETED\", \"sessionId\": " + ruleDay + "}"));
        // a repeating plan's day (setting one up through the API needs a rule)
        ScheduledWorkout fromRule = scheduledWorkoutRepository.findById(planned).orElseThrow();
        fromRule.setRepeatDate(today);
        scheduledWorkoutRepository.saveAndFlush(fromRule);
        long otherSession = doWorkout(push, true, bench, 70);
        long other = id(send(post("/scheduled-workouts"), "{\"date\": \"" + today + "\", \"workoutId\": " + push
            + ", \"status\": \"COMPLETED\", \"sessionId\": " + otherSession + "}"));

        reset(push);

        ScheduledWorkout back = scheduledWorkoutRepository.findById(planned).orElseThrow();
        assertThat(back.getStatus()).isEqualTo(ScheduleStatus.PLANNED);
        assertThat(back.getSessionId()).isNull();
        assertThat(scheduledWorkoutRepository.findById(other)).isEmpty();
    }

    @Test
    void anotherAccountsWorkoutIsNotFound() throws Exception {
        long session = doWorkout(push, true, bench, 60);
        bearer = signup("nosy2@example.com");

        mvc.perform(delete("/workouts/" + push + "/history").header("Authorization", bearer))
            .andExpect(status().isNotFound());
        mvc.perform(get("/workouts/" + push + "/history/count").header("Authorization", bearer))
            .andExpect(status().isNotFound());
        assertThat(sessionRepository.findById(session)).isPresent();
    }

    @Test
    void nothingToResetIsFine() throws Exception {
        String json = reset(push);
        assertThat((Integer) JsonPath.read(json, "$.sets")).isZero();
        assertThat((Integer) JsonPath.read(json, "$.sessions")).isZero();
    }

    // --- helpers ---

    // A session of the workout: each exerciseId followed by its weights; × 5 reps each.
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

    private String reset(long workoutId) throws Exception {
        return mvc.perform(delete("/workouts/" + workoutId + "/history").header("Authorization", bearer))
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
