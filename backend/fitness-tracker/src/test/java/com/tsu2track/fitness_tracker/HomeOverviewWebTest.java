package com.tsu2track.fitness_tracker;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;

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

/* What GET /sessions/overview adds for the redesigned Home, full stack.
   Past workouts are put straight in the database, since the app only
   logs today. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class HomeOverviewWebTest {

    // Monday 2 to Sunday 8 March 2026.
    private static final LocalDate MON = LocalDate.of(2026, 3, 2);
    private static final int SATURDAYS = 0b0100000;

    @Autowired MockMvc mvc;
    @Autowired WorkoutRepository workouts;
    @Autowired SessionRepository sessions;

    private String bearer;
    private long userId;
    private Workout workout;

    @BeforeEach
    void signUp() throws Exception {
        String json = mvc.perform(post("/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\": \"home@example.com\", \"password\": \"password123\", \"inviteCode\": \""
                    + TestAuth.INVITE_CODE + "\"}"))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        bearer = "Bearer " + JsonPath.read(json, "$.token");
        String me = mvc.perform(get("/auth/me").header("Authorization", bearer)).andReturn().getResponse().getContentAsString();
        userId = ((Number) JsonPath.read(me, "$.id")).longValue();
        Workout w = new Workout("Push Day");
        w.setUserId(userId);
        workout = workouts.save(w);
    }

    // --- weekDays: the week strip ---

    @Test
    void weekDaysMarkDoneAndPlannedDaysMondayToSunday() throws Exception {
        session(MON, true);                         // Mon: done
        session(MON.plusDays(1), false);            // Tue: only an unfinished one
        plan(MON.plusDays(2), null);                // Wed: planned
        plan(MON.plusDays(3), "SKIPPED");           // Thu: skipped, so not planned
        plan(MON.plusDays(4), null);                // Fri: planned and done
        session(MON.plusDays(4), true);
        repeat(SATURDAYS);                          // Sat: from the repeat rule

        overview()
            .andExpect(jsonPath("$.weekDays", hasSize(7)))
            .andExpect(jsonPath("$.weekDays[0].date").value("2026-03-02"))
            .andExpect(jsonPath("$.weekDays[6].date").value("2026-03-08"))
            .andExpect(day(0, true, false))
            .andExpect(day(1, false, false))
            .andExpect(day(2, false, true))
            .andExpect(day(3, false, false))
            .andExpect(day(4, true, true))
            .andExpect(day(5, false, true))
            .andExpect(day(6, false, false));
    }

    @Test
    void weekDaysOnlyCountThatWeek() throws Exception {
        session(MON.minusDays(1), true);            // the Sunday before
        plan(MON.plusDays(7), null);                // the Monday after

        overview().andExpect(jsonPath("$.weekDays[?(@.done == true || @.planned == true)]", hasSize(0)));
    }

    @Test
    void aNewAccountsWeekIsSevenEmptyDays() throws Exception {
        overview()
            .andExpect(jsonPath("$.weekDays", hasSize(7)))
            .andExpect(jsonPath("$.weekDays[?(@.done == true || @.planned == true)]", hasSize(0)));
    }

    // --- helpers ---

    private ResultActions overview() throws Exception {
        return mvc.perform(get("/sessions/overview").param("weekStart", MON.toString()).param("today", MON.toString())
                .header("Authorization", bearer))
            .andExpect(status().isOk());
    }

    private static org.springframework.test.web.servlet.ResultMatcher day(int i, boolean done, boolean planned) {
        return result -> {
            jsonPath("$.weekDays[" + i + "].done").value(done).match(result);
            jsonPath("$.weekDays[" + i + "].planned").value(planned).match(result);
        };
    }

    private Session session(LocalDate date, boolean finished) {
        Session s = new Session();
        s.setWorkout(workout);
        s.setDate(date);
        s.setFinished(finished);
        s.setUserId(userId);
        return sessions.save(s);
    }

    private void plan(LocalDate date, String status) throws Exception {
        mvc.perform(post("/scheduled-workouts").header("Authorization", bearer).contentType(MediaType.APPLICATION_JSON)
                .content("{\"date\": \"" + date + "\", \"workoutId\": " + workout.getId()
                    + (status != null ? ", \"status\": \"" + status + "\"" : "") + "}"))
            .andExpect(status().isOk());
    }

    private void repeat(int weekdays) throws Exception {
        mvc.perform(put("/workouts/" + workout.getId() + "/repeat?today=" + MON).header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"weekdays\": " + weekdays + ", \"startDate\": \"" + MON + "\"}"))
            .andExpect(status().isOk());
    }
}
