package com.tsu2track.fitness_tracker;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import com.jayway.jsonpath.JsonPath;

/* Each account sees and changes only its own data. Account A fills in one
   of everything; account B then tries every endpoint with A's ids. A
   reading of another account's row is "not found", the same as a missing
   one (or empty, where a missing one was already empty). Full stack. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class DataIsolationTest {

    private static final LocalDate DAY = LocalDate.of(2026, 3, 2);
    private static final String WEEK = "?weekStart=2026-03-02&today=2026-03-02";

    @Autowired MockMvc mvc;

    private String a;
    private String b;
    private long workout;
    private long exercise;
    private long finished;
    private long unfinished;
    private long set;
    private long planned;

    @BeforeEach
    void accountAHasOneOfEverything() throws Exception {
        a = signup("a@example.com");
        b = signup("b@example.com");

        workout = id(send(a, post("/workouts"), "{\"name\": \"Upper\"}"));
        exercise = id(send(a, post("/workouts/" + workout + "/exercises"),
            "{\"name\": \"Bench\", \"category\": \"CHEST\"}"));

        finished = id(send(a, post("/workouts/" + workout + "/sessions"), null));
        send(a, post("/sessions/" + finished + "/sets?exerciseId=" + exercise), "{\"weight\": 100, \"reps\": 5}");
        send(a, post("/sessions/" + finished + "/finish"), null);
        unfinished = id(send(a, post("/workouts/" + workout + "/sessions"), null));
        set = id(send(a, post("/sessions/" + unfinished + "/sets?exerciseId=" + exercise), "{\"weight\": 60, \"reps\": 8}"));

        planned = id(send(a, post("/scheduled-workouts"),
            "{\"date\": \"" + DAY + "\", \"workoutId\": " + workout + "}"));
        send(a, put("/bodyweight/" + DAY), "{\"weightKg\": 80}");
    }

    @Test
    void listsShowNothingOfAnotherAccount() throws Exception {
        call(b, get("/workouts")).andExpect(jsonPath("$", hasSize(0)));
        call(b, get("/exercises")).andExpect(jsonPath("$", hasSize(0)));
        call(b, get("/sessions/unfinished")).andExpect(status().isNoContent());
        call(b, get("/sessions/overview" + WEEK))
            .andExpect(jsonPath("$.lastSession").isEmpty())
            .andExpect(jsonPath("$.nextPlanned").isEmpty());
        call(b, get("/scheduled-workouts?from=" + DAY + "&to=" + DAY)).andExpect(jsonPath("$", hasSize(0)));
        call(b, get("/scheduled-workouts/by-date/" + DAY)).andExpect(jsonPath("$", hasSize(0)));
        call(b, get("/bodyweight")).andExpect(jsonPath("$", hasSize(0)));
        call(b, get("/bodyweight/summary?today=" + DAY)).andExpect(jsonPath("$.latest").isEmpty());
    }

    @Test
    void anotherAccountsIdsReadAsNotFound() throws Exception {
        call(b, get("/exercises/" + exercise)).andExpect(status().isNotFound());
        call(b, get("/exercises/" + exercise + "/history")).andExpect(status().isNotFound());
        call(b, get("/workouts/" + workout + "/exercises")).andExpect(status().isNotFound());
        call(b, get("/workouts/" + workout + "/sessions")).andExpect(status().isNotFound());
        call(b, get("/sessions/" + finished + "/exercises")).andExpect(status().isNotFound());
        call(b, get("/sessions/" + finished + "/sets")).andExpect(status().isNotFound());
        call(b, get("/workouts/" + workout + "/sessions/" + unfinished + "/previous-totals"))
            .andExpect(status().isNotFound());
        call(b, get("/workouts/" + workout + "/exercises/" + exercise + "/last-sets"))
            .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void anotherAccountCannotChangeAnything() throws Exception {
        String bench = "{\"name\": \"Hacked\", \"category\": \"CHEST\"}";
        send(b, put("/exercises/" + exercise), bench).andExpect(status().isNotFound());
        send(b, put("/workouts/" + workout + "/exercises/" + exercise), bench).andExpect(status().isNotFound());
        send(b, put("/exercises/" + exercise + "/note"), "{\"content\": \"hi\"}").andExpect(status().isNotFound());
        call(b, delete("/exercises/" + exercise));
        send(b, post("/workouts/" + workout + "/exercises"), bench).andExpect(status().isNotFound());
        call(b, post("/workouts/" + workout + "/exercises/" + exercise + "/link")).andExpect(status().isNotFound());
        call(b, delete("/workouts/" + workout + "/exercises/" + exercise)).andExpect(status().isNotFound());
        send(b, patch("/workouts/" + workout + "/exercises/order"), "{\"orderedExerciseIds\": [" + exercise + "]}")
            .andExpect(status().isNotFound());

        // B's own workout can't take A's exercise either.
        long own = id(send(b, post("/workouts"), "{\"name\": \"Mine\"}"));
        call(b, post("/workouts/" + own + "/exercises/" + exercise + "/link")).andExpect(status().isNotFound());

        call(b, post("/workouts/" + workout + "/sessions")).andExpect(content().string(""));
        call(b, post("/sessions/" + unfinished + "/finish")).andExpect(status().isNotFound());
        send(b, post("/sessions/" + unfinished + "/sets?exerciseId=" + exercise), "{\"weight\": 1, \"reps\": 1}")
            .andExpect(content().string(""));
        send(b, put("/sets/" + set), "{\"weight\": 1, \"reps\": 1}").andExpect(content().string(""));
        call(b, delete("/sets/" + set));

        send(b, post("/scheduled-workouts"), "{\"date\": \"" + DAY + "\", \"workoutId\": " + workout + "}")
            .andExpect(status().isBadRequest());
        send(b, patch("/scheduled-workouts/" + planned), "{\"status\": \"SKIPPED\"}").andExpect(status().isNotFound());
        call(b, delete("/scheduled-workouts/" + planned)).andExpect(status().isNotFound());
        call(b, delete("/bodyweight/" + DAY)).andExpect(status().isNotFound());
        call(b, delete("/sessions/" + finished)).andExpect(status().isNotFound());
        call(b, delete("/workouts/" + workout)).andExpect(status().isNotFound());

        // A's data is exactly as it was.
        call(a, get("/workouts"))
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].exerciseCount").value(1));
        call(a, get("/exercises/" + exercise))
            .andExpect(jsonPath("$.name").value("Bench"))
            .andExpect(jsonPath("$.notes").isEmpty())
            .andExpect(jsonPath("$.deleted").value(false));
        call(a, get("/sessions/unfinished")).andExpect(jsonPath("$.id").value(unfinished));
        call(a, get("/sessions/" + unfinished + "/sets"))
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].weight").value(60.0));
        call(a, get("/workouts/" + workout + "/sessions")).andExpect(jsonPath("$.content", hasSize(2)));
        call(a, get("/scheduled-workouts/by-date/" + DAY))
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].status").value("PLANNED"));
        call(a, get("/bodyweight")).andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void eachAccountHasItsOwnWeighInForADay() throws Exception {
        send(b, put("/bodyweight/" + DAY), "{\"weightKg\": 60}").andExpect(status().isOk());

        call(a, get("/bodyweight")).andExpect(jsonPath("$[0].weightKg").value(80.0));
        call(b, get("/bodyweight")).andExpect(jsonPath("$[0].weightKg").value(60.0));
    }

    @Test
    void homeStatsCountOnlyYourOwnSessions() throws Exception {
        long own = id(send(b, post("/workouts"), "{\"name\": \"Mine\"}"));
        long ownSession = id(send(b, post("/workouts/" + own + "/sessions"), null));

        call(b, get("/sessions/unfinished")).andExpect(jsonPath("$.id").value(ownSession));
        call(a, get("/sessions/unfinished")).andExpect(jsonPath("$.id").value(unfinished));
    }

    // --- helpers ---

    private String signup(String email) throws Exception {
        String json = mvc.perform(post("/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\": \"" + email + "\", \"password\": \"password123\", \"inviteCode\": \""
                    + TestAuth.INVITE_CODE + "\"}"))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return "Bearer " + JsonPath.read(json, "$.token");
    }

    private ResultActions call(String bearer, MockHttpServletRequestBuilder request) throws Exception {
        return send(bearer, request, null);
    }

    private ResultActions send(String bearer, MockHttpServletRequestBuilder request, String body) throws Exception {
        request.header("Authorization", bearer);
        if (body != null) request.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(request);
    }

    private static long id(ResultActions result) throws Exception {
        String json = result.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }
}
