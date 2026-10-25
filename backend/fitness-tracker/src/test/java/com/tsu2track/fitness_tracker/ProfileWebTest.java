package com.tsu2track.fitness_tracker;

import static org.hamcrest.Matchers.hasItem;
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

import com.jayway.jsonpath.JsonPath;

/* The profile: none until first saved, only the name required, each
   account sees only its own. Full stack. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ProfileWebTest {

    @Autowired MockMvc mvc;

    private String bearer;

    @BeforeEach
    void signUp() throws Exception {
        bearer = signup("long@example.com");
    }

    @Test
    void noProfileUntilFirstSaved() throws Exception {
        mvc.perform(get("/profile").header("Authorization", bearer)).andExpect(status().isNoContent());
    }

    @Test
    void nameAloneIsEnough() throws Exception {
        save(bearer, "{\"name\": \"  Long  \"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Long"))
            .andExpect(jsonPath("$.birthDate").isEmpty())
            .andExpect(jsonPath("$.userId").doesNotExist());

        mvc.perform(get("/profile").header("Authorization", bearer))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Long"));
    }

    @Test
    void savingAgainReplacesEveryField() throws Exception {
        save(bearer, "{\"name\": \"Long\", \"birthDate\": \"2000-05-01\", \"heightCm\": 175, \"weeklyGoal\": 4}")
            .andExpect(jsonPath("$.birthDate").value("2000-05-01"))
            .andExpect(jsonPath("$.heightCm").value(175))
            .andExpect(jsonPath("$.weeklyGoal").value(4));

        save(bearer, "{\"name\": \"Longy\", \"weeklyGoal\": 3}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Longy"))
            .andExpect(jsonPath("$.heightCm").isEmpty())
            .andExpect(jsonPath("$.weeklyGoal").value(3));
    }

    @Test
    void nameIsRequired() throws Exception {
        for (String body : new String[] { "{}", "{\"name\": \"\"}", "{\"name\": \"   \"}" }) {
            save(bearer, body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("name"))
                .andExpect(jsonPath("$.errors[0].message").value("Name is required."));
        }
        mvc.perform(get("/profile").header("Authorization", bearer)).andExpect(status().isNoContent());
    }

    @Test
    void eachFieldIsChecked() throws Exception {
        expectError("{\"name\": \"" + "x".repeat(41) + "\"}", "name", "Name must be 40 characters or fewer.");
        expectError("{\"name\": \"Long\", \"birthDate\": \"" + LocalDate.now().plusDays(1) + "\"}",
            "birthDate", "Date of birth must be in the past.");
        expectError("{\"name\": \"Long\", \"birthDate\": \"" + LocalDate.now().minusYears(121) + "\"}",
            "birthDate", "Date of birth is too far in the past.");
        expectError("{\"name\": \"Long\", \"heightCm\": 99}", "heightCm", "Height must be between 100 and 250 cm.");
        expectError("{\"name\": \"Long\", \"heightCm\": 251}", "heightCm", "Height must be between 100 and 250 cm.");
        expectError("{\"name\": \"Long\", \"weeklyGoal\": 0}", "weeklyGoal", "Weekly goal must be between 1 and 7.");
        expectError("{\"name\": \"Long\", \"weeklyGoal\": 8}", "weeklyGoal", "Weekly goal must be between 1 and 7.");

        save(bearer, "{\"name\": \"" + "x".repeat(40) + "\", \"heightCm\": 250, \"weeklyGoal\": 7}")
            .andExpect(status().isOk());
    }

    @Test
    void eachAccountHasItsOwnProfile() throws Exception {
        save(bearer, "{\"name\": \"Long\"}");
        String friend = signup("friend@example.com");

        mvc.perform(get("/profile").header("Authorization", friend)).andExpect(status().isNoContent());
        save(friend, "{\"name\": \"Sam\"}").andExpect(jsonPath("$.name").value("Sam"));
        mvc.perform(get("/profile").header("Authorization", bearer)).andExpect(jsonPath("$.name").value("Long"));
    }

    @Test
    void needsALogin() throws Exception {
        mvc.perform(get("/profile")).andExpect(status().isUnauthorized());
        mvc.perform(put("/profile").contentType(MediaType.APPLICATION_JSON).content("{\"name\": \"Long\"}"))
            .andExpect(status().isUnauthorized());
    }

    private void expectError(String body, String field, String message) throws Exception {
        save(bearer, body)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors[*].field", hasItem(field)))
            .andExpect(jsonPath("$.errors[*].message", hasItem(message)));
    }

    private ResultActions save(String bearer, String body) throws Exception {
        return mvc.perform(put("/profile").header("Authorization", bearer)
            .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private String signup(String email) throws Exception {
        String json = mvc.perform(post("/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\": \"" + email + "\", \"password\": \"password123\", \"inviteCode\": \""
                    + TestAuth.INVITE_CODE + "\"}"))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return "Bearer " + JsonPath.read(json, "$.token");
    }
}
