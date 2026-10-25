package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.tsu2track.fitness_tracker.security.SecurityConfig;
import com.tsu2track.fitness_tracker.service.SessionService;

/* HTTP layer only (service mocked): ValidationExceptionHandler's error
   shape for both exception branches, and the session-history paging clamp.
   Runs through the real security chain, so requests carry a login token. */
@WebMvcTest(controllers = { SessionController.class, ExerciseSetController.class })
@Import({ SecurityConfig.class, TestAuth.class })
class WebLayerTest {


    @Autowired MockMvc mvc;
    @MockitoBean SessionService sessionService;

    // --- MethodArgumentNotValidException branch ---

    @Test
    void invalidSetBodyListsEveryBadField() throws Exception {
        mvc.perform(createSet("{\"weight\": -1, \"reps\": 0}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.status").value(400))
            .andExpect(jsonPath("$.error").value("Validation failed"))
            .andExpect(jsonPath("$.path").value("/sessions/1/sets"))
            .andExpect(jsonPath("$.errors[*].field", containsInAnyOrder("weight", "reps")));

        verify(sessionService, never()).createSet(anyLong(), anyLong(), any());
    }

    @Test
    void missingRequiredFieldIsReported() throws Exception {
        mvc.perform(createSet("{\"weight\": 20}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors[0].field").value("reps"));
    }

    // --- HttpMessageNotReadableException branch ---

    @Test
    void malformedJsonIsABadRequest() throws Exception {
        mvc.perform(createSet("{\"weight\": 20, \"reps\": "))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors[0].field").value("(body)"))
            .andExpect(jsonPath("$.errors[0].message").value("malformed request body"));
    }

    @Test
    void wrongTypeNamesTheField() throws Exception {
        mvc.perform(createSet("{\"weight\": 20, \"reps\": \"lots\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors[0].field").value("reps"))
            .andExpect(jsonPath("$.errors[0].message").value("invalid value"));
    }

    @Test
    void unknownEnumValueListsTheAllowedOnes() throws Exception {
        mvc.perform(createSet("{\"weight\": 20, \"reps\": 5, \"side\": \"MIDDLE\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors[0].field").value("side"))
            .andExpect(jsonPath("$.errors[0].message").value("must be one of [LEFT, RIGHT]"));
    }

    @Test
    void validSetReachesTheService() throws Exception {
        mvc.perform(createSet("{\"weight\": 20, \"reps\": 5}"))
            .andExpect(status().isOk());

        verify(sessionService).createSet(eq(1L), eq(7L), any());
    }

    // --- Paging clamp on GET /workouts/{id}/sessions ---

    @Test
    void pagingDefaultsToFirstPageOfFive() throws Exception {
        assertPaging("", 0, 5);
    }

    @Test
    void pageSizeIsCappedAt100() throws Exception {
        assertPaging("?size=1000000", 0, 100);
    }

    @Test
    void pageSizeBelowOneBecomesOne() throws Exception {
        assertPaging("?size=0", 0, 1);
        assertPaging("?size=-5", 0, 1);
    }

    @Test
    void negativePageBecomesFirstPage() throws Exception {
        assertPaging("?page=-1&size=10", 0, 10);
    }

    @Test
    void validPagingPassesThrough() throws Exception {
        assertPaging("?page=2&size=20", 2, 20);
    }

    // --- GET /sessions/unfinished ---

    @Test
    void unfinishedSessionIsReturned() throws Exception {
        Workout w = new Workout("Upper");
        w.setId(3L);
        Session s = new Session();
        s.setId(42L);
        s.setWorkout(w);
        s.setDate(java.time.LocalDate.of(2026, 1, 6));
        s.setLastActivityAt(java.time.Instant.parse("2026-01-06T09:30:00Z"));
        when(sessionService.findUnfinishedSession()).thenReturn(java.util.Optional.of(s));

        mvc.perform(get("/sessions/unfinished").header("Authorization", TestAuth.BEARER))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(42))
            .andExpect(jsonPath("$.workoutId").value(3))
            .andExpect(jsonPath("$.date").value("2026-01-06"))
            .andExpect(jsonPath("$.finished").value(false))
            .andExpect(jsonPath("$.lastActivityAt").value("2026-01-06T09:30:00Z"));
    }

    @Test
    void noUnfinishedSessionIsNoContent() throws Exception {
        when(sessionService.findUnfinishedSession()).thenReturn(java.util.Optional.empty());

        mvc.perform(get("/sessions/unfinished").header("Authorization", TestAuth.BEARER))
            .andExpect(status().isNoContent());
    }

    // --- GET /sessions/overview ---

    @Test
    void overviewReportsWeekCountAndLastSession() throws Exception {
        Workout w = new Workout("Legs");
        w.setId(4L);
        Session s = new Session();
        s.setId(9L);
        s.setWorkout(w);
        s.setDate(java.time.LocalDate.of(2026, 10, 22));
        s.setFinished(true);
        when(sessionService.countFinishedInWeek(java.time.LocalDate.of(2026, 10, 19))).thenReturn(3L);
        when(sessionService.findLastFinishedSession()).thenReturn(java.util.Optional.of(s));
        when(sessionService.countWeekStreak(java.time.LocalDate.of(2026, 10, 19))).thenReturn(5);
        ScheduledWorkout plan = new ScheduledWorkout();
        plan.setWorkout(w);
        plan.setDate(java.time.LocalDate.of(2026, 10, 24));
        when(sessionService.findNextPlanned(java.time.LocalDate.of(2026, 10, 23))).thenReturn(java.util.Optional.of(plan));
        when(sessionService.countPlannedOn(java.time.LocalDate.of(2026, 10, 24))).thenReturn(2L);

        mvc.perform(get("/sessions/overview").param("weekStart", "2026-10-19").param("today", "2026-10-23")
                .header("Authorization", TestAuth.BEARER))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.sessionsThisWeek").value(3))
            .andExpect(jsonPath("$.lastSession.workoutId").value(4))
            .andExpect(jsonPath("$.lastSession.date").value("2026-10-22"))
            .andExpect(jsonPath("$.weekStreak").value(5))
            .andExpect(jsonPath("$.nextPlanned.workoutId").value(4))
            .andExpect(jsonPath("$.nextPlanned.date").value("2026-10-24"))
            .andExpect(jsonPath("$.plannedThatDay").value(2));
    }

    @Test
    void overviewWithNoSessionsYet() throws Exception {
        when(sessionService.countFinishedInWeek(any())).thenReturn(0L);
        when(sessionService.findLastFinishedSession()).thenReturn(java.util.Optional.empty());

        mvc.perform(get("/sessions/overview").param("weekStart", "2026-10-19").header("Authorization", TestAuth.BEARER))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.sessionsThisWeek").value(0))
            .andExpect(jsonPath("$.lastSession").isEmpty())
            .andExpect(jsonPath("$.weekStreak").value(0))
            .andExpect(jsonPath("$.nextPlanned").isEmpty())
            .andExpect(jsonPath("$.plannedThatDay").value(0));
    }

    @Test
    void overviewNeedsWeekStart() throws Exception {
        mvc.perform(get("/sessions/overview").header("Authorization", TestAuth.BEARER))
            .andExpect(status().isBadRequest());
    }

    // --- Security sanity: these tests really go through the key check ---

    @Test
    void requestsWithoutTheKeyAreRejected() throws Exception {
        mvc.perform(get("/workouts/1/sessions"))
            .andExpect(status().isUnauthorized());
    }

    // --- helpers ---

    private MockHttpServletRequestBuilder createSet(String json) {
        return post("/sessions/1/sets")
            .param("exerciseId", "7")
            .header("Authorization", TestAuth.BEARER)
            .contentType(MediaType.APPLICATION_JSON)
            .content(json);
    }

    private void assertPaging(String query, int expectedPage, int expectedSize) throws Exception {
        org.mockito.Mockito.clearInvocations(sessionService);
        when(sessionService.findSessions(anyLong(), any())).thenReturn(Page.empty());

        mvc.perform(get("/workouts/1/sessions" + query).header("Authorization", TestAuth.BEARER))
            .andExpect(status().isOk());

        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        verify(sessionService).findSessions(eq(1L), captor.capture());
        assertThat(captor.getValue().getPageNumber()).as("page for '%s'", query).isEqualTo(expectedPage);
        assertThat(captor.getValue().getPageSize()).as("size for '%s'", query).isEqualTo(expectedSize);
    }
}
