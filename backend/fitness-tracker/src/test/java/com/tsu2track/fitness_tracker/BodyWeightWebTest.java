package com.tsu2track.fitness_tracker;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.tsu2track.fitness_tracker.security.SecurityConfig;
import com.tsu2track.fitness_tracker.service.BodyWeightService;

/* HTTP layer for the bodyweight log: the weight must be above 0 before
   the service is called, and the date comes from the path. */
@WebMvcTest(controllers = BodyWeightController.class)
@Import({ SecurityConfig.class, TestAuth.class })
class BodyWeightWebTest {

    private static final LocalDate DAY = LocalDate.of(2026, 10, 25);

    @Autowired MockMvc mvc;
    @MockitoBean BodyWeightService service;

    @Test
    void savesTheWeightForThePathDate() throws Exception {
        when(service.log(eq(DAY), eq(72.4))).thenReturn(new BodyWeight(DAY, 72.4));

        mvc.perform(logWeight("{\"weightKg\": 72.4}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.date").value("2026-10-25"))
            .andExpect(jsonPath("$.weightKg").value(72.4));
    }

    @Test
    void listsTheHistory() throws Exception {
        when(service.history()).thenReturn(java.util.List.of(
            new BodyWeight(DAY.minusDays(1), 72.6), new BodyWeight(DAY, 72.4)));

        mvc.perform(get("/bodyweight").header("Authorization", TestAuth.BEARER))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].date").value("2026-10-24"))
            .andExpect(jsonPath("$[1].weightKg").value(72.4));
    }

    @Test
    void rejectsMissingZeroAndNegativeWeights() throws Exception {
        mvc.perform(logWeight("{\"weightKg\": 0}")).andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors[0].field").value("weightKg"));
        mvc.perform(logWeight("{\"weightKg\": -3}")).andExpect(status().isBadRequest());
        mvc.perform(logWeight("{}")).andExpect(status().isBadRequest());

        verify(service, never()).log(any(), anyDouble());
    }

    private MockHttpServletRequestBuilder logWeight(String json) {
        return put("/bodyweight/2026-10-25")
            .header("Authorization", TestAuth.BEARER)
            .contentType(MediaType.APPLICATION_JSON)
            .content(json);
    }
}
