package com.tsu2track.fitness_tracker;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.containsStringIgnoringCase;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

import com.jayway.jsonpath.JsonPath;

/* The login flow over HTTP, full stack: sign-up and login are open, every
   other endpoint needs a valid token, and errors use the usual JSON shape
   so the client can show what went wrong. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AuthWebTest {

    @Autowired MockMvc mvc;

    @Test
    void signupReturnsATokenThatOpensTheApi() throws Exception {
        String token = signup("long@example.com", "correct horse")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.user.email").value("long@example.com"))
            .andReturn().getResponse().getContentAsString();
        String bearer = "Bearer " + JsonPath.read(token, "$.token");

        mvc.perform(get("/auth/me").header("Authorization", bearer))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.email").value("long@example.com"));
        mvc.perform(get("/workouts").header("Authorization", bearer))
            .andExpect(status().isOk());
    }

    @Test
    void everythingElseNeedsAToken() throws Exception {
        mvc.perform(get("/workouts"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.errors[0].field").value("Authorization"));
        mvc.perform(get("/workouts").header("Authorization", "Bearer made-up"))
            .andExpect(status().isUnauthorized());
        mvc.perform(get("/workouts").header("X-API-Key", "dev-key"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void signupValidatesEveryField() throws Exception {
        mvc.perform(post("/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\": \"not-an-email\", \"password\": \"short\", \"inviteCode\": \"\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors[*].field", containsInAnyOrder("email", "password", "inviteCode")));
    }

    @Test
    void emailDomainNeedsADot() throws Exception {
        for (String email : new String[] { "long@gmail", "long@", "@gmail.com", "long gmail.com", "lo ng@gmail.com" }) {
            mvc.perform(post("/auth/signup").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"email\": \"" + email + "\", \"password\": \"correct horse\", \"inviteCode\": \""
                        + TestAuth.INVITE_CODE + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("email"))
                .andExpect(jsonPath("$.errors[0].message").value("Invalid email format."));
        }
        signup("long@gmail.co.nz", "correct horse").andExpect(status().isCreated());
    }

    @Test
    void wrongInviteCodeExplainsItself() throws Exception {
        mvc.perform(post("/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\": \"long@example.com\", \"password\": \"correct horse\", \"inviteCode\": \"guess\"}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.errors[0].field").value("inviteCode"))
            .andExpect(jsonPath("$.errors[0].message").value("Invalid invite code."));
    }

    @Test
    void wrongPasswordIsA401WithAMessage() throws Exception {
        signup("long@example.com", "correct horse");

        login("long@example.com", "wrong horse")
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.errors[0].message").value("Wrong email or password."));
        login("long@example.com", "correct horse")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").isNotEmpty());
    }

    @Test
    void logoutEndsTheToken() throws Exception {
        String body = signup("long@example.com", "correct horse").andReturn().getResponse().getContentAsString();
        String bearer = "Bearer " + JsonPath.read(body, "$.token");

        mvc.perform(post("/auth/logout").header("Authorization", bearer))
            .andExpect(status().isNoContent());
        mvc.perform(get("/auth/me").header("Authorization", bearer))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void changePasswordOverHttp() throws Exception {
        String bearer = bearer(signup("long@example.com", "correct horse"));

        changePassword(bearer, "wrong horse", "battery staple")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors[0].field").value("currentPassword"))
            .andExpect(jsonPath("$.errors[0].message").value("Current password is incorrect."));
        changePassword(bearer, "correct horse", "short")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors[0].field").value("newPassword"));
        changePassword(bearer, "correct horse", "battery staple")
            .andExpect(status().isNoContent());

        mvc.perform(get("/auth/me").header("Authorization", bearer)).andExpect(status().isOk());
        login("long@example.com", "battery staple").andExpect(status().isOk());
    }

    @Test
    void logoutEverywhereOverHttp() throws Exception {
        String phone = bearer(signup("long@example.com", "correct horse"));
        String laptop = bearer(login("long@example.com", "correct horse"));

        mvc.perform(post("/auth/logout-all").header("Authorization", phone))
            .andExpect(status().isNoContent());

        mvc.perform(get("/auth/me").header("Authorization", phone)).andExpect(status().isUnauthorized());
        mvc.perform(get("/auth/me").header("Authorization", laptop)).andExpect(status().isUnauthorized());
    }

    @Test
    void browsersMaySendTheAuthorizationHeader() throws Exception {
        mvc.perform(options("/workouts")
                .header("Origin", "http://127.0.0.1:5500")
                .header("Access-Control-Request-Method", "GET")
                .header("Access-Control-Request-Headers", "authorization"))
            .andExpect(status().isOk())
            .andExpect(header().string("Access-Control-Allow-Headers", containsStringIgnoringCase("authorization")));
    }

    private ResultActions signup(String email, String password) throws Exception {
        return mvc.perform(post("/auth/signup").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\": \"" + email + "\", \"password\": \"" + password
                + "\", \"inviteCode\": \"" + TestAuth.INVITE_CODE + "\"}"));
    }

    private ResultActions changePassword(String bearer, String current, String next) throws Exception {
        return mvc.perform(post("/auth/password").header("Authorization", bearer)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"currentPassword\": \"" + current + "\", \"newPassword\": \"" + next + "\"}"));
    }

    private static String bearer(ResultActions loginOrSignup) throws Exception {
        return "Bearer " + JsonPath.read(loginOrSignup.andReturn().getResponse().getContentAsString(), "$.token");
    }

    private ResultActions login(String email, String password) throws Exception {
        return mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\": \"" + email + "\", \"password\": \"" + password + "\"}"));
    }
}
