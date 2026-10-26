package com.tsu2track.fitness_tracker;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.tsu2track.fitness_tracker.security.SecurityConfig;
import com.tsu2track.fitness_tracker.service.ExerciseHistoryService;
import com.tsu2track.fitness_tracker.service.ExerciseHistoryService.History;
import com.tsu2track.fitness_tracker.service.ExerciseHistoryService.HistorySession;
import com.tsu2track.fitness_tracker.service.ExerciseHistoryService.HistorySet;
import com.tsu2track.fitness_tracker.service.ExerciseHistoryService.Record;
import com.tsu2track.fitness_tracker.service.ExerciseHistoryService.Records;
import com.tsu2track.fitness_tracker.service.ExerciseHistoryService.Trend;
import com.tsu2track.fitness_tracker.service.ExerciseHistoryService.TrendPoint;

/* HTTP shape of GET /exercises/{id}/history and its paging defaults. */
@WebMvcTest(controllers = ExerciseHistoryController.class)
@Import({ SecurityConfig.class, TestAuth.class })
class ExerciseHistoryWebTest {

    private static final LocalDate DAY = LocalDate.of(2026, 10, 20);

    @Autowired MockMvc mvc;
    @MockitoBean ExerciseHistoryService service;

    @Test
    void returnsRecordsAndOnePageOfSessions() throws Exception {
        Record top = new Record(80, 5, null, null, DAY);
        when(service.history(3L, 0, 10)).thenReturn(new History(new Records(LogType.WEIGHT_REPS, top, top, null, top, null),
            List.of(new HistorySession(7L, DAY, 2L, LogType.WEIGHT_REPS, List.of(new HistorySet(80, 5, null, null, null, true)))), true,
            new Trend("MAX_KG", List.of(new TrendPoint(DAY, null, 93.3)))));

        mvc.perform(get("/exercises/3/history").header("Authorization", TestAuth.BEARER))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.records.heaviest.weight").value(80.0))
            .andExpect(jsonPath("$.records.bestSet.date").value("2026-10-20"))
            .andExpect(jsonPath("$.records.bestLeft").isEmpty())
            .andExpect(jsonPath("$.records.bestRight.reps").value(5))
            .andExpect(jsonPath("$.sessions[0].workoutId").value(2))
            .andExpect(jsonPath("$.sessions[0].sets[0].reps").value(5))
            .andExpect(jsonPath("$.sessions[0].sets[0].pr").value(true))
            .andExpect(jsonPath("$.hasMore").value(true))
            .andExpect(jsonPath("$.trend.metric").value("MAX_KG"))
            .andExpect(jsonPath("$.trend.points[0].date").value("2026-10-20"))
            .andExpect(jsonPath("$.trend.points[0].value").value(93.3));
    }

    @Test
    void clampsPaging() throws Exception {
        mvc.perform(get("/exercises/3/history").param("page", "-2").param("size", "500").header("Authorization", TestAuth.BEARER));

        verify(service).history(3L, 0, 50);
    }
}
