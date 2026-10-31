package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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
import com.tsu2track.fitness_tracker.service.CalendarPlans;

/* Deleting a saved entry works like any other delete: the rule doesn't plan
   the day again (V17). Upper repeats Mon + Thu from Mon 2 Mar 2026. Full
   stack, in-memory H2. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class RepeatDayClearedTest {

    private static final LocalDate MON = LocalDate.of(2026, 3, 2);
    private static final LocalDate TUE = MON.plusDays(1);
    private static final LocalDate THU = MON.plusDays(3);
    private static final LocalDate SUN = MON.plusDays(6);
    private static final LocalDate NEXT_MON = MON.plusDays(7);

    @Autowired MockMvc mvc;
    @Autowired WorkoutRepository workoutRepository;
    @Autowired WorkoutRepeatRepository repeatRepository;
    @Autowired RepeatDayClearedRepository clearedRepository;
    @Autowired ScheduledWorkoutRepository scheduledRepository;
    @Autowired SessionRepository sessionRepository;
    @Autowired CalendarPlans calendarPlans;
    @Autowired AuthService authService;

    private Workout upper;
    private String bearer;
    private AuthUser user;

    @BeforeEach
    void setUp() {
        var login = authService.signup("cleared@example.com", "password123", TestAuth.INVITE_CODE);
        bearer = "Bearer " + login.token();
        user = login.user();
        LoggedIn.as(user);
        upper = workoutRepository.save(new Workout("Upper"));
        WorkoutRepeat rule = new WorkoutRepeat();
        rule.setWorkout(upper);
        rule.setStartDate(MON);
        rule.setWeekdays(0b0001001);
        repeatRepository.save(rule);
    }

    @AfterEach
    void logOut() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void aDeletedPlannedDayStaysGoneAndOtherDaysStay() throws Exception {
        remove(idOf(create(MON, null, MON)));

        day(MON).andExpect(jsonPath("$", hasSize(0)));
        range(MON, NEXT_MON).andExpect(jsonPath("$[*].date", contains(THU.toString(), NEXT_MON.toString())));
    }

    @Test
    void aDeletedSkippedDayStaysGone() throws Exception {
        remove(idOf(create(MON, "SKIPPED", MON)));

        day(MON).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void aDeletedFinishedDayStaysGone() throws Exception {
        Long session = finishedSession(MON);
        Long entry = idOf(create(MON, "COMPLETED", MON, session));
        mvc.perform(delete("/sessions/" + session).header("Authorization", bearer)).andExpect(status().isOk());
        remove(entry);

        day(MON).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void aDeletedMovedDayDoesntReturnOnEitherDay() throws Exception {
        Long entry = idOf(create(MON, null, MON));
        move(entry, TUE);
        remove(entry);

        day(MON).andExpect(jsonPath("$", hasSize(0)));
        day(TUE).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void aMovedEntryOnlyClearsTheDayItCameFrom() throws Exception {
        Long entry = idOf(create(MON, null, MON));
        Long thursday = idOf(create(THU, null, THU));
        move(thursday, TUE);
        move(entry, THU);
        remove(entry);

        day(MON).andExpect(jsonPath("$", hasSize(0)));
        day(TUE).andExpect(jsonPath("$", hasSize(1)));
        LoggedIn.as(user);
        assertThat(clearedRepository.findByWorkout_Id(upper.getId())).hasSize(1);
    }

    @Test
    void anEntryOnADayARuleLaterCoveredStaysGone() throws Exception {
        LoggedIn.as(user);
        ScheduledWorkout earlier = new ScheduledWorkout();
        earlier.setWorkout(upper);
        earlier.setDate(MON);
        earlier.setStatus(ScheduleStatus.PLANNED);
        Long id = scheduledRepository.save(earlier).getId();

        remove(id);

        day(MON).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void aMoveOntoAPlannedDayIsRefusedAndChangesNothing() throws Exception {
        Long entry = idOf(create(MON, null, MON));

        mvc.perform(patch("/scheduled-workouts/" + entry).header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content("{\"date\": \"" + THU + "\"}"))
            .andExpect(status().isConflict());

        day(MON).andExpect(jsonPath("$[0].id").value(entry));
        day(THU).andExpect(jsonPath("$[0].id").doesNotExist());
    }

    @Test
    void handPlanningOnAPlannedDayIsRefused() throws Exception {
        create(MON, null, null).andExpect(status().isConflict());

        day(MON).andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void aMoveOntoADayFreedByAMoveOrDeleteIsAllowed() throws Exception {
        Long thursday = idOf(create(THU, null, THU));
        move(thursday, TUE);
        Long monday = idOf(create(MON, null, MON));

        move(monday, THU);
        day(THU).andExpect(jsonPath("$[0].id").value(monday));

        move(monday, MON);
        day(MON).andExpect(jsonPath("$[0].id").value(monday));
    }

    @Test
    void savingAndSkippingTheDayItselfStillWork() throws Exception {
        Long entry = idOf(create(MON, null, MON));

        mvc.perform(patch("/scheduled-workouts/" + entry).header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\": \"SKIPPED\"}"))
            .andExpect(status().isOk());
    }

    @Test
    void aFinishedWorkoutCanStillBeRecordedOnAPlannedDay() throws Exception {
        create(MON, "COMPLETED", null, finishedSession(MON)).andExpect(status().isOk());
    }

    @Test
    void aHandPlannedEntryOffTheRuleClearsNothing() throws Exception {
        remove(idOf(create(TUE, null, null)));

        LoggedIn.as(user);
        assertThat(clearedRepository.findByWorkout_Id(upper.getId())).isEmpty();
        range(MON, SUN).andExpect(jsonPath("$", hasSize(2)));
    }

    @Test
    void aClearedDayCanBePlannedByHandAndDeletedAgain() throws Exception {
        remove(idOf(create(MON, null, MON)));

        Long again = idOf(create(MON, null, null));
        day(MON).andExpect(jsonPath("$", hasSize(1)));
        remove(again);

        day(MON).andExpect(jsonPath("$", hasSize(0)));
        LoggedIn.as(user);
        assertThat(clearedRepository.findByWorkout_Id(upper.getId())).hasSize(1);
    }

    @Test
    void aClearedDayCantBeSavedFromTheRule() throws Exception {
        remove(idOf(create(MON, null, MON)));

        create(MON, null, MON).andExpect(status().isConflict());
    }

    @Test
    void anotherWorkoutOnTheDayIsntAffected() throws Exception {
        LoggedIn.as(user);
        Workout lower = workoutRepository.save(new Workout("Lower"));
        WorkoutRepeat rule = new WorkoutRepeat();
        rule.setWorkout(lower);
        rule.setStartDate(MON);
        rule.setWeekdays(0b0000001);
        repeatRepository.save(rule);

        remove(idOf(create(MON, null, MON)));

        day(MON).andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].workoutId").value(lower.getId()));
    }

    @Test
    void nextUpSkipsAClearedDay() throws Exception {
        remove(idOf(create(MON, null, MON)));

        LoggedIn.as(user);
        assertThat(calendarPlans.next(MON).orElseThrow().getDate()).isEqualTo(THU);
        assertThat(calendarPlans.countPlannedOn(MON)).isZero();
    }

    @Test
    void deletingAWorkoutDeletesItsClearedDays() throws Exception {
        remove(idOf(create(MON, null, MON)));

        Long workoutId = upper.getId();
        mvc.perform(delete("/workouts/" + workoutId).header("Authorization", bearer)).andExpect(status().isOk());

        LoggedIn.as(user);
        assertThat(clearedRepository.findByWorkout_Id(workoutId)).isEmpty();
    }

    @Test
    void anotherAccountCantDeleteAnEntry() throws Exception {
        Long entry = idOf(create(MON, null, MON));
        String other = "Bearer " + authService.signup("other@example.com", "password123", TestAuth.INVITE_CODE).token();

        mvc.perform(delete("/scheduled-workouts/" + entry).header("Authorization", other))
            .andExpect(status().isNotFound());

        LoggedIn.as(user);
        assertThat(clearedRepository.findByWorkout_Id(upper.getId())).isEmpty();
        day(MON).andExpect(jsonPath("$", hasSize(1)));
    }

    // --- helpers ---

    // Each request clears the login on this thread (TokenAuthFilter), so set it again.
    private Long finishedSession(LocalDate date) {
        LoggedIn.as(user);
        Session s = new Session();
        s.setWorkout(upper);
        s.setDate(date);
        s.setFinished(true);
        return sessionRepository.save(s).getId();
    }

    private void remove(Long id) throws Exception {
        mvc.perform(delete("/scheduled-workouts/" + id).header("Authorization", bearer)).andExpect(status().isOk());
    }

    private void move(Long id, LocalDate date) throws Exception {
        mvc.perform(patch("/scheduled-workouts/" + id).header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content("{\"date\": \"" + date + "\"}"))
            .andExpect(status().isOk());
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
        return mvc.perform(post("/scheduled-workouts").header("Authorization", bearer)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"date\": \"" + date + "\", \"workoutId\": " + upper.getId()
                + (status != null ? ", \"status\": \"" + status + "\"" : "")
                + (repeatDate != null ? ", \"repeatDate\": \"" + repeatDate + "\"" : "")
                + (sessionId != null ? ", \"sessionId\": " + sessionId : "") + "}"));
    }

    private Long idOf(ResultActions result) throws Exception {
        String json = result.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return Long.valueOf(json.replaceAll(".*\"id\":(\\d+).*", "$1"));
    }
}
