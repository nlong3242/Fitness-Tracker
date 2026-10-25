package com.tsu2track.fitness_tracker;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

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
import com.tsu2track.fitness_tracker.service.BuiltInExercises;

/* Built-in exercises (builtin-exercises.json): in everyone's list, usable
   without copying, read-only. History, last-time numbers and notes stay
   each account's own; Delete hides one for that account; a Custom copy
   takes over the account's workouts, sets and note. Full stack. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class BuiltInExercisesTest {

    private static final String BENCH = "Barbell Bench Press - Medium Grip";
    private static final int IN_FILE = 10;

    @Autowired MockMvc mvc;
    @Autowired BuiltInExercises builtInExercises;

    private String a;
    private String b;
    private long bench;

    @BeforeEach
    void twoAccounts() throws Exception {
        a = signup("a@example.com");
        b = signup("b@example.com");
        bench = builtInId(a, BENCH);
    }

    @Test
    void loadedFromTheFileForEveryone() throws Exception {
        for (String who : List.of(a, b)) {
            call(who, get("/exercises")).andExpect(jsonPath("$[?(@.builtIn == true)]", hasSize(IN_FILE)));
        }
        call(a, get("/exercises/" + bench))
            .andExpect(jsonPath("$.name").value(BENCH))
            .andExpect(jsonPath("$.builtIn").value(true))
            .andExpect(jsonPath("$.category").value("CHEST"))
            .andExpect(jsonPath("$.primaryMuscleGroups").value("Chest"))
            .andExpect(jsonPath("$.exerciseType").value("Compound"))
            .andExpect(jsonPath("$.equipment").value("Barbell"))
            .andExpect(jsonPath("$.level").value("Beginner"))
            .andExpect(jsonPath("$.unilateral").value(false))
            // The dataset's instructions, one step a line.
            .andExpect(jsonPath("$.cues", containsString("This will be your starting position.\nFrom the starting position")));
        call(a, get("/exercises/" + builtInId(a, "One-Arm Dumbbell Row"))).andExpect(jsonPath("$.unilateral").value(true));
        call(a, get("/exercises/" + builtInId(a, "Plank"))).andExpect(jsonPath("$.category").value("CORE"));
    }

    @Test
    void longCuesSurviveAFinishedSession() throws Exception {
        long workout = logOnce(a, 100, null);
        String json = call(a, get("/workouts/" + workout + "/sessions")).andReturn().getResponse().getContentAsString();
        long session = ((Number) JsonPath.read(json, "$.content[0].id")).longValue();
        call(a, get("/sessions/" + session + "/exercises"))
            .andExpect(jsonPath("$[0].cues", containsString("place the bar back in the rack")));
    }

    @Test
    void startingAgainDoesNotAddThemTwice() throws Exception {
        builtInExercises.run(null);
        call(a, get("/exercises")).andExpect(jsonPath("$[?(@.builtIn == true)]", hasSize(IN_FILE)));
    }

    @Test
    void customAndBuiltInSortedTogether() throws Exception {
        send(a, post("/exercises"), "{\"name\": \"Cable Fly\", \"category\": \"CHEST\"}");
        String json = call(a, get("/exercises")).andReturn().getResponse().getContentAsString();
        List<String> names = JsonPath.read(json, "$[*].name");
        List<String> sorted = names.stream().sorted(String.CASE_INSENSITIVE_ORDER).toList();
        org.junit.jupiter.api.Assertions.assertEquals(sorted, names);
        call(a, get("/exercises")).andExpect(jsonPath("$[?(@.name == 'Cable Fly')].builtIn", contains(false)));
    }

    @Test
    void cannotBeChanged() throws Exception {
        String body = "{\"name\": \"Mine now\", \"category\": \"CHEST\"}";
        send(a, put("/exercises/" + bench), body).andExpect(status().isConflict());
        long workout = id(send(a, post("/workouts"), "{\"name\": \"Upper\"}"));
        call(a, post("/workouts/" + workout + "/exercises/" + bench + "/link")).andExpect(status().isOk());
        send(a, put("/workouts/" + workout + "/exercises/" + bench), body).andExpect(status().isConflict());
        call(b, get("/exercises/" + bench)).andExpect(jsonPath("$.name").value(BENCH));
    }

    @Test
    void usedByTwoAccountsEachSeesOnlyTheirOwn() throws Exception {
        long workoutA = logOnce(a, 100, "a's note");
        long workoutB = logOnce(b, 60, null);

        call(a, get("/exercises/" + bench + "/history"))
            .andExpect(jsonPath("$.sessions", hasSize(1)))
            .andExpect(jsonPath("$.sessions[0].sets[0].weight").value(100))
            .andExpect(jsonPath("$.records.heaviest.weight").value(100));
        call(b, get("/exercises/" + bench + "/history"))
            .andExpect(jsonPath("$.sessions", hasSize(1)))
            .andExpect(jsonPath("$.sessions[0].sets[0].weight").value(60));
        call(b, get("/workouts/" + workoutB + "/exercises/" + bench + "/last-sets"))
            .andExpect(jsonPath("$[*].weight", contains(60.0)));

        // Notes: a's own, nowhere for b.
        call(a, get("/exercises/" + bench)).andExpect(jsonPath("$.notes").value("a's note"));
        call(a, get("/workouts/" + workoutA + "/exercises")).andExpect(jsonPath("$[0].notes").value("a's note"));
        call(a, get("/exercises")).andExpect(jsonPath("$[?(@.id == " + bench + ")].notes", contains("a's note")));
        call(b, get("/exercises/" + bench)).andExpect(jsonPath("$.notes").value(nullValue()));
        call(b, get("/workouts/" + workoutB + "/exercises")).andExpect(jsonPath("$[0].notes").value(nullValue()));
        call(b, get("/exercises")).andExpect(jsonPath("$[?(@.id == " + bench + ")].notes", contains((Object) null)));
    }

    @Test
    void deleteHidesItForThatAccountOnly() throws Exception {
        long workout = id(send(a, post("/workouts"), "{\"name\": \"Upper\"}"));
        call(a, post("/workouts/" + workout + "/exercises/" + bench + "/link"));
        call(a, delete("/exercises/" + bench)).andExpect(status().isOk());
        call(a, delete("/exercises/" + bench)).andExpect(status().isOk());

        call(a, get("/exercises")).andExpect(jsonPath("$[?(@.id == " + bench + ")]", hasSize(0)));
        call(b, get("/exercises")).andExpect(jsonPath("$[?(@.id == " + bench + ")]", hasSize(1)));
        // Still in the workout it was in, and still there for everyone.
        call(a, get("/workouts/" + workout + "/exercises")).andExpect(jsonPath("$[*].id", contains((int) bench)));
        call(b, get("/exercises/" + bench)).andExpect(jsonPath("$.deleted").value(false));
    }

    @Test
    void aCustomCopyTakesOverButTheBuiltInOneStays() throws Exception {
        long workout = logOnce(a, 100, "a's note");
        logOnce(b, 60, "b's note");

        String copyJson = call(a, post("/exercises/" + bench + "/copy"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.builtIn").value(false))
            .andExpect(jsonPath("$.name").value(BENCH))
            .andExpect(jsonPath("$.equipment").value("Barbell"))
            .andExpect(jsonPath("$.notes").value("a's note"))
            .andReturn().getResponse().getContentAsString();
        long copy = ((Number) JsonPath.read(copyJson, "$.id")).longValue();

        // a: the workout, history and note are the copy's now.
        call(a, get("/workouts/" + workout + "/exercises")).andExpect(jsonPath("$[*].id", contains((int) copy)));
        call(a, get("/exercises/" + copy + "/history"))
            .andExpect(jsonPath("$.sessions", hasSize(1)))
            .andExpect(jsonPath("$.sessions[0].sets[0].weight").value(100));
        call(a, get("/exercises/" + bench + "/history")).andExpect(jsonPath("$.sessions", hasSize(0)));
        call(a, get("/exercises/" + bench)).andExpect(jsonPath("$.notes").value(nullValue()));
        call(a, get("/exercises/" + copy)).andExpect(jsonPath("$.cues", containsString("flat bench")));
        // Both in a's list.
        call(a, get("/exercises")).andExpect(jsonPath("$[?(@.name == '" + BENCH + "')].builtIn", contains(false, true)));
        // The copy is a's to change, long cues and all.
        String cues = JsonPath.read(copyJson, "$.cues");
        send(a, put("/exercises/" + copy), "{\"name\": \"My Bench\", \"category\": \"CHEST\", \"cues\": "
                + new tools.jackson.databind.ObjectMapper().writeValueAsString(cues + " Mine.") + "}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("My Bench"))
            .andExpect(jsonPath("$.cues", containsString("Mine.")));

        // b: untouched.
        call(b, get("/exercises/" + bench + "/history")).andExpect(jsonPath("$.sessions[0].sets[0].weight").value(60));
        call(b, get("/exercises/" + bench)).andExpect(jsonPath("$.notes").value("b's note"));
        call(b, get("/exercises/" + copy)).andExpect(status().isNotFound());
    }

    @Test
    void onlyBuiltInOnesAreCopied() throws Exception {
        long custom = id(send(a, post("/exercises"), "{\"name\": \"Cable Fly\", \"category\": \"CHEST\"}"));
        call(a, post("/exercises/" + custom + "/copy")).andExpect(status().isConflict());
        call(b, post("/exercises/" + custom + "/copy")).andExpect(status().isNotFound());
    }

    // A workout with the bench in it, one finished session at this weight, and a note.
    private long logOnce(String who, int weight, String note) throws Exception {
        long workout = id(send(who, post("/workouts"), "{\"name\": \"Upper\"}"));
        call(who, post("/workouts/" + workout + "/exercises/" + bench + "/link")).andExpect(status().isOk());
        long session = id(call(who, post("/workouts/" + workout + "/sessions")));
        send(who, post("/sessions/" + session + "/sets?exerciseId=" + bench), "{\"weight\": " + weight + ", \"reps\": 5}")
            .andExpect(status().isOk());
        call(who, post("/sessions/" + session + "/finish")).andExpect(status().isOk());
        if (note != null) send(who, put("/exercises/" + bench + "/note"), "{\"content\": \"" + note + "\"}");
        return workout;
    }

    private long builtInId(String who, String name) throws Exception {
        String json = call(who, get("/exercises")).andReturn().getResponse().getContentAsString();
        List<Number> ids = JsonPath.read(json, "$[?(@.builtIn == true && @.name == '" + name + "')].id");
        return ids.get(0).longValue();
    }

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
