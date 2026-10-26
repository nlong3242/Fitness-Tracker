package com.tsu2track.fitness_tracker;

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
import org.springframework.transaction.annotation.Transactional;

import com.jayway.jsonpath.JsonPath;

/* The home streak with weekly goals changed over time, the way the app
   does it: goals saved with PUT /profile?weekStart=..., the streak read
   from GET /sessions/overview. Past weeks' workouts are put straight in
   the database, since the app only logs today. Full stack. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class StreakGoalWebTest {

    // This week's Monday, and n weeks back.
    private static final LocalDate THIS_WEEK = LocalDate.of(2026, 10, 26);

    @Autowired MockMvc mvc;
    @Autowired WorkoutRepository workouts;
    @Autowired SessionRepository sessions;

    private String bearer;
    private long userId;
    private Workout workout;

    @BeforeEach
    void signUp() throws Exception {
        String json = mvc.perform(post("/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\": \"streak@example.com\", \"password\": \"password123\", \"inviteCode\": \""
                    + TestAuth.INVITE_CODE + "\"}"))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        bearer = "Bearer " + JsonPath.read(json, "$.token");
        String me = mvc.perform(get("/auth/me").header("Authorization", bearer)).andReturn().getResponse().getContentAsString();
        userId = ((Number) JsonPath.read(me, "$.id")).longValue();
        Workout w = new Workout("Upper");
        w.setUserId(userId);
        workout = workouts.save(w);
    }

    @Test
    void raisingTheGoalLeavesPastWeeksAlone() throws Exception {
        goal(3, weeksBack(5));
        for (int back = 5; back >= 0; back--) workouts(3, weeksBack(back));
        streakIs(6);

        // Raised to 4 this week: the 5 weeks of 3 still count; this week needs a 4th.
        goal(4, THIS_WEEK);
        streakIs(5);
        workouts(1, THIS_WEEK);
        streakIs(6);
    }

    @Test
    void raisingItAfterMeetingThisWeekTakesThisWeekBackUntilMet() throws Exception {
        goal(1, weeksBack(4));
        for (int back = 4; back >= 0; back--) workouts(1, weeksBack(back));
        streakIs(5);

        goal(2, THIS_WEEK);
        streakIs(4);                // not 0: past weeks keep a goal of 1
        workouts(1, THIS_WEEK);
        streakIs(5);
    }

    @Test
    void loweringTheGoalDoesNotReviveWeeksThatMissedTheirs() throws Exception {
        goal(4, weeksBack(3));
        workouts(3, weeksBack(3));  // missed its 4
        workouts(4, weeksBack(2));
        workouts(4, weeksBack(1));
        streakIs(2);

        // Lowered to 3 this week: weeks back stay judged by 4.
        goal(3, THIS_WEEK);
        workouts(3, THIS_WEEK);
        streakIs(3);
    }

    @Test
    void aGoalChangedInAPastWeekCountsFromThatWeek() throws Exception {
        goal(1, weeksBack(4));
        workouts(1, weeksBack(4));
        workouts(1, weeksBack(3));
        goal(2, weeksBack(2));      // from two weeks back: 2 a week
        workouts(2, weeksBack(2));
        workouts(1, weeksBack(1));  // missed its 2
        streakIs(0);

        workouts(1, weeksBack(1));  // now 2 that week
        streakIs(4);
    }

    @Test
    void withNoGoalOneAWeekCounts() throws Exception {
        workouts(1, weeksBack(2));
        workouts(1, weeksBack(1));
        streakIs(2);

        goal(2, THIS_WEEK);         // this week needs 2; the past 1-a-week weeks stand
        workouts(1, THIS_WEEK);
        streakIs(2);
    }

    private static LocalDate weeksBack(int n) {
        return THIS_WEEK.minusWeeks(n);
    }

    // The weekly goal as saved from the profile page in that week.
    private void goal(int goal, LocalDate weekStart) throws Exception {
        mvc.perform(put("/profile").param("weekStart", weekStart.toString()).header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\": \"Long\", \"weeklyGoal\": " + goal + "}"))
            .andExpect(status().isOk());
    }

    // n finished workouts on the Wednesday of that week.
    private void workouts(int n, LocalDate weekStart) {
        for (int i = 0; i < n; i++) {
            Session s = new Session();
            s.setWorkout(workout);
            s.setDate(weekStart.plusDays(2));
            s.setFinished(true);
            s.setUserId(userId);
            sessions.save(s);
        }
    }

    private void streakIs(int weeks) throws Exception {
        mvc.perform(get("/sessions/overview").param("weekStart", THIS_WEEK.toString())
                .param("today", THIS_WEEK.plusDays(2).toString()).header("Authorization", bearer))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.weekStreak").value(weeks));
    }
}
