package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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

import com.tsu2track.fitness_tracker.service.AuthService;

/* Setting, changing and stopping a workout's repeat rule through the API,
   and what the calendar shows after each. Changes reach forward only.
   2 Mar 2026 is a Monday; "today" is sent the way the app will send it. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class WorkoutRepeatWebTest {

    private static final LocalDate MON = LocalDate.of(2026, 3, 2);
    private static final int MON_THU = 0b0001001;
    private static final int TUE_FRI = 0b0010010;

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired WorkoutRepeatRepository repeatRepository;

    private String bearer;
    private long workout;

    @BeforeEach
    void setUp() throws Exception {
        bearer = "Bearer " + authService.signup("rule@example.com", "password123", TestAuth.INVITE_CODE).token();
        workout = idOf(mvc.perform(post("/workouts").header("Authorization", bearer)
            .contentType(MediaType.APPLICATION_JSON).content("{\"name\": \"Upper\"}")));
    }

    @Test
    void aWorkoutWithoutARuleHasNone() throws Exception {
        current(MON).andExpect(status().isNoContent());
    }

    @Test
    void settingAWeeklyRuleStartsToday() throws Exception {
        set(MON.plusDays(1), "{\"weekdays\": " + MON_THU + "}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.workoutId").value(workout))
            .andExpect(jsonPath("$.startDate").value(MON.plusDays(1).toString()))
            .andExpect(jsonPath("$.endDate", nullValue()))
            .andExpect(jsonPath("$.weekdays").value(MON_THU))
            .andExpect(jsonPath("$.everyDays", nullValue()));

        current(MON.plusDays(1)).andExpect(jsonPath("$.weekdays").value(MON_THU));
        // From Tuesday: Thursday is the first planned day.
        dates(MON, MON.plusDays(13)).andExpect(jsonPath("$[*].date",
            contains("2026-03-05", "2026-03-09", "2026-03-12")));
    }

    @Test
    void everyNDaysWithAStartAndEndDate() throws Exception {
        set(MON, "{\"everyDays\": 3, \"startDate\": \"2026-03-04\", \"endDate\": \"2026-03-10\"}")
            .andExpect(status().isOk());

        dates(MON, MON.plusDays(20)).andExpect(jsonPath("$[*].date",
            contains("2026-03-04", "2026-03-07", "2026-03-10")));
        // Not started yet, but it's the one coming up.
        current(MON).andExpect(jsonPath("$.everyDays").value(3));
    }

    @Test
    void aRuleIsWeeklyOrEveryNDaysNotBothOrNeither() throws Exception {
        set(MON, "{\"weekdays\": " + MON_THU + ", \"everyDays\": 2}").andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors[0].field").value("weekdays"));
        set(MON, "{}").andExpect(status().isBadRequest());
    }

    @Test
    void outOfRangeNumbersAreRejected() throws Exception {
        set(MON, "{\"weekdays\": 0}").andExpect(status().isBadRequest());
        set(MON, "{\"weekdays\": 128}").andExpect(status().isBadRequest());
        set(MON, "{\"everyDays\": 0}").andExpect(status().isBadRequest());
        set(MON, "{\"everyDays\": 366}").andExpect(status().isBadRequest());
    }

    @Test
    void theStartCantBeInThePastNorTheEndBeforeIt() throws Exception {
        set(MON, "{\"weekdays\": 1, \"startDate\": \"2026-03-01\"}").andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors[0].field").value("startDate"));
        set(MON, "{\"weekdays\": 1, \"endDate\": \"2026-03-01\"}").andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors[0].field").value("endDate"));
    }

    @Test
    void changingARuleKeepsThePastAndChangesFromToday() throws Exception {
        set(MON, "{\"weekdays\": " + MON_THU + "}").andExpect(status().isOk());
        LocalDate nextMon = MON.plusDays(7);
        set(nextMon, "{\"weekdays\": " + TUE_FRI + "}").andExpect(status().isOk());

        // Week 1 keeps Mon + Thu; week 2 on is Tue + Fri.
        dates(MON, MON.plusDays(13)).andExpect(jsonPath("$[*].date",
            contains("2026-03-02", "2026-03-05", "2026-03-10", "2026-03-13")));
        current(nextMon).andExpect(jsonPath("$.weekdays").value(TUE_FRI));
        assertThat(repeatRepository.findByWorkout_IdOrderByStartDateAsc(workout))
            .extracting(WorkoutRepeat::getEndDate).containsExactly(MON.plusDays(6), null);
    }

    @Test
    void changingARuleTheDayItStartedReplacesIt() throws Exception {
        set(MON, "{\"weekdays\": " + MON_THU + "}").andExpect(status().isOk());
        set(MON, "{\"everyDays\": 2}").andExpect(status().isOk());

        assertThat(repeatRepository.findByWorkout_IdOrderByStartDateAsc(workout))
            .singleElement().extracting(WorkoutRepeat::getEveryDays).isEqualTo(2);
    }

    @Test
    void stoppingPlansNothingFromToday() throws Exception {
        set(MON, "{\"weekdays\": " + MON_THU + "}").andExpect(status().isOk());
        LocalDate nextMon = MON.plusDays(7);
        // A day already saved (skipped ahead of time) stays on the calendar.
        mvc.perform(post("/scheduled-workouts").header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"date\": \"2026-03-12\", \"workoutId\": " + workout
                    + ", \"status\": \"SKIPPED\", \"repeatDate\": \"2026-03-12\"}"))
            .andExpect(status().isOk());

        stop(nextMon).andExpect(status().isOk());

        current(nextMon).andExpect(status().isNoContent());
        dates(MON, MON.plusDays(13))
            .andExpect(jsonPath("$[*].date", contains("2026-03-02", "2026-03-05", "2026-03-12")))
            .andExpect(jsonPath("$[2].status").value("SKIPPED"));
    }

    @Test
    void stoppingARuleThatHadntStartedRemovesIt() throws Exception {
        set(MON, "{\"weekdays\": 1, \"startDate\": \"2026-03-09\"}").andExpect(status().isOk());

        stop(MON).andExpect(status().isOk());

        assertThat(repeatRepository.findByWorkout_IdOrderByStartDateAsc(workout)).isEmpty();
    }

    @Test
    void stoppingWithoutARuleIsFine() throws Exception {
        stop(MON).andExpect(status().isOk());
    }

    @Test
    void aStoppedWorkoutCanRepeatAgain() throws Exception {
        set(MON, "{\"weekdays\": " + MON_THU + "}").andExpect(status().isOk());
        stop(MON.plusDays(7)).andExpect(status().isOk());
        set(MON.plusDays(14), "{\"weekdays\": " + MON_THU + "}").andExpect(status().isOk());

        dates(MON, MON.plusDays(20)).andExpect(jsonPath("$[*].date",
            contains("2026-03-02", "2026-03-05", "2026-03-16", "2026-03-19")));
    }

    @Test
    void deletingTheWorkoutDeletesItsRule() throws Exception {
        set(MON, "{\"weekdays\": " + MON_THU + "}").andExpect(status().isOk());

        mvc.perform(delete("/workouts/" + workout).header("Authorization", bearer)).andExpect(status().isOk());

        dates(MON, MON.plusDays(13)).andExpect(jsonPath("$", hasSize(0)));
        assertThat(repeatRepository.findByWorkout_IdOrderByStartDateAsc(workout)).isEmpty();
    }

    @Test
    void anotherAccountCantSeeOrChangeTheRule() throws Exception {
        set(MON, "{\"weekdays\": " + MON_THU + "}").andExpect(status().isOk());
        String other = "Bearer " + authService.signup("other@example.com", "password123", TestAuth.INVITE_CODE).token();
        String url = "/workouts/" + workout + "/repeat?today=" + MON;

        mvc.perform(get(url).header("Authorization", other)).andExpect(status().isNotFound());
        mvc.perform(put(url).header("Authorization", other).contentType(MediaType.APPLICATION_JSON)
            .content("{\"weekdays\": 1}")).andExpect(status().isNotFound());
        mvc.perform(delete(url).header("Authorization", other)).andExpect(status().isNotFound());

        current(MON).andExpect(jsonPath("$.weekdays").value(MON_THU));
    }

    @Test
    void homeShowsTheRuleDayAsNextUp() throws Exception {
        set(MON, "{\"weekdays\": " + MON_THU + "}").andExpect(status().isOk());

        // Wednesday: Thursday's Upper is next, the only plan that day.
        mvc.perform(get("/sessions/overview?weekStart=" + MON + "&today=2026-03-04").header("Authorization", bearer))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.nextPlanned.workoutId").value(workout))
            .andExpect(jsonPath("$.nextPlanned.date").value("2026-03-05"))
            .andExpect(jsonPath("$.nextPlanned.id", nullValue()))
            .andExpect(jsonPath("$.nextPlanned.repeatDate").value("2026-03-05"))
            .andExpect(jsonPath("$.plannedThatDay").value(1));
    }

    @Test
    void aMissingWorkoutIsNotFound() throws Exception {
        mvc.perform(get("/workouts/999999/repeat").header("Authorization", bearer)).andExpect(status().isNotFound());
    }

    // --- helpers ---

    private ResultActions current(LocalDate today) throws Exception {
        return mvc.perform(get("/workouts/" + workout + "/repeat?today=" + today).header("Authorization", bearer));
    }

    private ResultActions set(LocalDate today, String body) throws Exception {
        return mvc.perform(put("/workouts/" + workout + "/repeat?today=" + today).header("Authorization", bearer)
            .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions stop(LocalDate today) throws Exception {
        return mvc.perform(delete("/workouts/" + workout + "/repeat?today=" + today).header("Authorization", bearer));
    }

    private ResultActions dates(LocalDate from, LocalDate to) throws Exception {
        return mvc.perform(get("/scheduled-workouts?from=" + from + "&to=" + to).header("Authorization", bearer));
    }

    private long idOf(ResultActions result) throws Exception {
        String json = result.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return Long.parseLong(json.replaceAll(".*\"id\":(\\d+).*", "$1"));
    }
}
