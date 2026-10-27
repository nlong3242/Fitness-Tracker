package com.tsu2track.fitness_tracker;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

import com.tsu2track.fitness_tracker.security.AuthUser;
import com.tsu2track.fitness_tracker.service.AuthService;

/* The calendar with repeat rules (V15, V16): rule days show as unsaved
   PLANNED entries; a saved entry for that workout on the day, or one made
   from the day and moved away, takes the day over. Upper repeats Mon + Thu
   from Mon 2 Mar 2026. Full stack, in-memory H2. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class CalendarRepeatTest {

    private static final LocalDate MON = LocalDate.of(2026, 3, 2);
    private static final LocalDate TUE = MON.plusDays(1);
    private static final LocalDate THU = MON.plusDays(3);
    private static final LocalDate SUN = MON.plusDays(6);
    private static final int MON_THU = 0b0001001;

    @Autowired MockMvc mvc;
    @Autowired WorkoutRepository workoutRepository;
    @Autowired WorkoutRepeatRepository repeatRepository;
    @Autowired SessionRepository sessionRepository;
    @Autowired AuthService authService;

    private Workout upper;
    private String bearer;
    private AuthUser user;

    @BeforeEach
    void setUp() {
        var login = authService.signup("repeat@example.com", "password123", TestAuth.INVITE_CODE);
        bearer = "Bearer " + login.token();
        user = login.user();
        LoggedIn.as(user);
        upper = workoutRepository.save(new Workout("Upper"));
        repeatRepository.save(weekly(upper, MON, null));
    }

    @AfterEach
    void logOut() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void ruleDaysShowAsUnsavedPlans() throws Exception {
        range(MON, SUN)
            .andExpect(jsonPath("$", hasSize(2)))
            .andExpect(jsonPath("$[*].date", contains(MON.toString(), THU.toString())))
            .andExpect(jsonPath("$[0].id", nullValue()))
            .andExpect(jsonPath("$[0].status").value("PLANNED"))
            .andExpect(jsonPath("$[0].workoutId").value(upper.getId()))
            .andExpect(jsonPath("$[0].repeatDate").value(MON.toString()));
    }

    @Test
    void aDayViewShowsTheRuleDayOnlyOnPlannedDays() throws Exception {
        day(MON).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].id", nullValue()));
        day(TUE).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void nothingBeforeTheStartOrAfterTheEnd() throws Exception {
        LoggedIn.as(user);
        Workout lower = workoutRepository.save(new Workout("Lower"));
        repeatRepository.save(weekly(lower, THU, THU.plusDays(7)));

        range(MON.minusDays(7), MON.plusDays(20))
            .andExpect(jsonPath("$[?(@.workoutId == " + lower.getId() + ")].date",
                contains(THU.toString(), MON.plusDays(7).toString(), THU.plusDays(7).toString())));
    }

    @Test
    void savingARepeatDayTakesItOver() throws Exception {
        create(MON, "SKIPPED", MON).andExpect(status().isOk());

        day(MON)
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].id", notNullValue()))
            .andExpect(jsonPath("$[0].status").value("SKIPPED"))
            .andExpect(jsonPath("$[0].repeatDate").value(MON.toString()));
    }

    @Test
    void aMovedRepeatDayLeavesItsDayEmpty() throws Exception {
        Long saved = idOf(create(MON, null, MON));
        update(saved, "{\"date\": \"" + TUE + "\"}").andExpect(status().isOk());

        day(MON).andExpect(jsonPath("$", hasSize(0)));
        day(TUE).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].id").value(saved));
        // Even when the range doesn't reach the day it moved to.
        range(MON.minusDays(3), MON).andExpect(jsonPath("$", hasSize(0)));
        range(MON, SUN).andExpect(jsonPath("$[*].date", contains(TUE.toString(), THU.toString())));
    }

    @Test
    void aMovedRepeatDayCanMoveBack() throws Exception {
        Long saved = idOf(create(MON, null, MON));
        update(saved, "{\"date\": \"" + TUE + "\"}").andExpect(status().isOk());
        update(saved, "{\"date\": \"" + MON + "\"}").andExpect(status().isOk());

        day(MON).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].id").value(saved));
        day(TUE).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void aHandPlannedEntryOnARuleDayIsTheOnlyOne() throws Exception {
        create(THU, null, null).andExpect(status().isOk());

        day(THU).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].id", notNullValue()));
    }

    @Test
    void doingTheWorkoutOnARuleDayTakesItOver() throws Exception {
        create(MON, "COMPLETED", null, session(MON).getId()).andExpect(status().isOk());

        day(MON).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].status").value("COMPLETED"));
    }

    @Test
    void otherWorkoutsOnTheDayDontTakeItOver() throws Exception {
        LoggedIn.as(user);
        Workout lower = workoutRepository.save(new Workout("Lower"));
        create(lower, MON).andExpect(status().isOk());

        day(MON)
            .andExpect(jsonPath("$", hasSize(2)))
            .andExpect(jsonPath("$[0].workoutId").value(lower.getId()))
            .andExpect(jsonPath("$[1].workoutId").value(upper.getId()))
            .andExpect(jsonPath("$[1].id", nullValue()));
    }

    @Test
    void everyNDaysRulesShowToo() throws Exception {
        LoggedIn.as(user);
        Workout cardio = workoutRepository.save(new Workout("Cardio"));
        WorkoutRepeat rule = new WorkoutRepeat();
        rule.setWorkout(cardio);
        rule.setStartDate(MON);
        rule.setEveryDays(3);
        repeatRepository.save(rule);

        range(MON, SUN).andExpect(jsonPath("$[?(@.workoutId == " + cardio.getId() + ")].date",
            contains(MON.toString(), THU.toString(), SUN.toString())));
    }

    @Test
    void aRepeatDayTheRuleDoesntPlanIsRejected() throws Exception {
        create(TUE, null, TUE).andExpect(status().isBadRequest());
    }

    @Test
    void aRepeatDayCanOnlyBeSavedOnce() throws Exception {
        Long saved = idOf(create(MON, null, MON));
        update(saved, "{\"date\": \"" + TUE + "\"}").andExpect(status().isOk());

        create(MON, null, MON).andExpect(status().isConflict());
    }

    @Test
    void aRangeOverFourHundredDaysIsRejected() throws Exception {
        range(MON, MON.plusDays(400)).andExpect(status().isOk());
        range(MON, MON.plusDays(401)).andExpect(status().isBadRequest());
    }

    @Test
    void anotherAccountSeesNoRuleDays() throws Exception {
        String other = "Bearer " + authService.signup("other@example.com", "password123", TestAuth.INVITE_CODE).token();

        mvc.perform(get("/scheduled-workouts?from=" + MON + "&to=" + SUN).header("Authorization", other))
            .andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(post("/scheduled-workouts").header("Authorization", other)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"date\": \"" + MON + "\", \"workoutId\": " + upper.getId() + ", \"repeatDate\": \"" + MON + "\"}"))
            .andExpect(status().isBadRequest());
    }

    // --- helpers ---

    private static WorkoutRepeat weekly(Workout workout, LocalDate start, LocalDate end) {
        WorkoutRepeat r = new WorkoutRepeat();
        r.setWorkout(workout);
        r.setStartDate(start);
        r.setEndDate(end);
        r.setWeekdays(MON_THU);
        return r;
    }

    // Each request clears the login on this thread (TokenAuthFilter), so set it again.
    private Session session(LocalDate date) {
        LoggedIn.as(user);
        Session s = new Session();
        s.setWorkout(upper);
        s.setDate(date);
        s.setFinished(true);
        return sessionRepository.save(s);
    }

    private ResultActions range(LocalDate from, LocalDate to) throws Exception {
        return mvc.perform(get("/scheduled-workouts?from=" + from + "&to=" + to).header("Authorization", bearer));
    }

    private ResultActions day(LocalDate date) throws Exception {
        return mvc.perform(get("/scheduled-workouts/by-date/" + date).header("Authorization", bearer));
    }

    private ResultActions create(LocalDate date, String status, LocalDate repeatDate) throws Exception {
        return create(date, status, repeatDate, null);
    }

    private ResultActions create(LocalDate date, String status, LocalDate repeatDate, Long sessionId) throws Exception {
        return send("{\"date\": \"" + date + "\", \"workoutId\": " + upper.getId()
            + (status != null ? ", \"status\": \"" + status + "\"" : "")
            + (repeatDate != null ? ", \"repeatDate\": \"" + repeatDate + "\"" : "")
            + (sessionId != null ? ", \"sessionId\": " + sessionId : "") + "}");
    }

    private ResultActions create(Workout workout, LocalDate date) throws Exception {
        return send("{\"date\": \"" + date + "\", \"workoutId\": " + workout.getId() + "}");
    }

    private ResultActions send(String body) throws Exception {
        return mvc.perform(post("/scheduled-workouts").header("Authorization", bearer)
            .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions update(Long id, String body) throws Exception {
        return mvc.perform(patch("/scheduled-workouts/" + id).header("Authorization", bearer)
            .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private Long idOf(ResultActions result) throws Exception {
        String json = result.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return Long.valueOf(json.replaceAll(".*\"id\":(\\d+).*", "$1"));
    }
}
