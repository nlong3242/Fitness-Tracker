package com.tsu2track.fitness_tracker;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

/* Calendar entry rules (V4): at most one plan (PLANNED/SKIPPED) per date
   and workout, but COMPLETED entries repeat — one per session, so a
   workout done twice in a day shows twice. Full stack, in-memory H2. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ScheduleRulesTest {

    private static final LocalDate DAY = LocalDate.of(2026, 3, 2);
    private static final LocalDate OTHER_DAY = LocalDate.of(2026, 3, 3);

    @Autowired MockMvc mvc;
    @Autowired WorkoutRepository workoutRepository;
    @Autowired SessionRepository sessionRepository;
    @Autowired ScheduledWorkoutRepository scheduledWorkoutRepository;
    @Autowired AuthService authService;

    private Workout workout;
    private String bearer;

    @BeforeEach
    void setUp() {
        workout = workoutRepository.save(new Workout("Upper"));
        bearer = "Bearer " + authService.signup("rules@example.com", "password123", TestAuth.INVITE_CODE).token();
    }

    @Test
    void sameWorkoutCompletedTwiceInADayGetsTwoEntries() throws Exception {
        create(DAY, "COMPLETED", session().getId()).andExpect(status().isOk());
        create(DAY, "COMPLETED", session().getId()).andExpect(status().isOk());

        org.assertj.core.api.Assertions.assertThat(
            scheduledWorkoutRepository.findByDateOrderByCreatedAtAsc(DAY)).hasSize(2);
    }

    @Test
    void cannotPlanTheSameWorkoutTwiceOnADay() throws Exception {
        create(DAY, null, null).andExpect(status().isOk());
        create(DAY, null, null).andExpect(status().isConflict());
        create(DAY, "SKIPPED", null).andExpect(status().isConflict());
    }

    @Test
    void canPlanAgainOnADayItWasAlreadyCompleted() throws Exception {
        create(DAY, "COMPLETED", session().getId()).andExpect(status().isOk());
        create(DAY, null, null).andExpect(status().isOk());
    }

    @Test
    void movingAPlanOntoAnotherPlanConflicts() throws Exception {
        create(DAY, null, null).andExpect(status().isOk());
        Long other = idOf(create(OTHER_DAY, null, null));

        update(other, "{\"date\": \"" + DAY + "\"}").andExpect(status().isConflict());
    }

    @Test
    void movingAPlanOntoACompletionIsFine() throws Exception {
        create(DAY, "COMPLETED", session().getId()).andExpect(status().isOk());
        Long plan = idOf(create(OTHER_DAY, null, null));

        update(plan, "{\"date\": \"" + DAY + "\"}").andExpect(status().isOk());
    }

    @Test
    void completingAPlanNextToAnotherCompletionIsFine() throws Exception {
        create(DAY, "COMPLETED", session().getId()).andExpect(status().isOk());
        Long plan = idOf(create(DAY, null, null));

        update(plan, "{\"status\": \"COMPLETED\", \"sessionId\": " + session().getId() + "}")
            .andExpect(status().isOk());
    }

    @Test
    void turningACompletionBackIntoAPlanRespectsTheOnePlanRule() throws Exception {
        create(DAY, null, null).andExpect(status().isOk());
        Long done = idOf(create(DAY, "COMPLETED", session().getId()));

        update(done, "{\"status\": \"PLANNED\"}").andExpect(status().isConflict());
    }

    // --- helpers ---

    private Session session() {
        Session s = new Session();
        s.setWorkout(workout);
        s.setDate(DAY);
        s.setFinished(true);
        return sessionRepository.save(s);
    }

    private ResultActions create(LocalDate date, String status, Long sessionId) throws Exception {
        String body = "{\"date\": \"" + date + "\", \"workoutId\": " + workout.getId()
            + (status != null ? ", \"status\": \"" + status + "\"" : "")
            + (sessionId != null ? ", \"sessionId\": " + sessionId : "") + "}";
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
