package gov.dipr.vaarta;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import gov.dipr.vaarta.security.JwtService;
import gov.dipr.vaarta.security.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Users & access, audit log, password change and sign-in lockout. Each test works on its own users so the shared demo logins stay intact. */
@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:vaarta-test;DB_CLOSE_DELAY=-1", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class AdminTest {
    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired ObjectMapper json;

    private String token(String user, Role role) { return "Bearer " + jwt.issue(user, role); }
    private String commr() { return token("commr.dipr", Role.COMMISSIONER); }

    private JsonNode body(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    private ResultActions send(String auth, String path, Object body) throws Exception {
        return mvc.perform(post(path).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    private ResultActions login(String user, String password) throws Exception {
        JsonNode cap = json.readTree(mvc.perform(post("/api/auth/captcha")).andReturn().getResponse().getContentAsString());
        String[] ab = cap.get("question").asText().split("\\+");
        int answer = Integer.parseInt(ab[0].trim()) + Integer.parseInt(ab[1].trim());
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(
                Map.of("username", user, "password", password, "captchaId", cap.get("id").asText(), "captchaAnswer", String.valueOf(answer)))));
    }

    private Map<String, Object> user(String username, String role, String key, String value) {
        Map<String, Object> m = new HashMap<>(Map.of("username", username, "displayName", "Test " + username, "role", role, "password", "start1234"));
        if (key != null) m.put(key, value);
        return m;
    }

    private long create(Map<String, Object> u) throws Exception {
        return body(send(commr(), "/api/users", u).andExpect(status().isOk())).get("id").asLong();
    }

    @Test
    void onlyTheCommissionerManagesUsersAndReadsTheAuditLog() throws Exception {
        for (String t : new String[]{token("jd.news", Role.JD_NEWS), token("dd.accounts", Role.DD_ACCOUNTS), token("dio.raichur", Role.DIO),
                token("vendor.prk02", Role.VENDOR)}) {
            mvc.perform(get("/api/users").header("Authorization", t)).andExpect(status().isForbidden());
            mvc.perform(get("/api/audit").header("Authorization", t)).andExpect(status().isForbidden());
            send(t, "/api/users", user("x.sneaky", "COMMISSIONER", null, null)).andExpect(status().isForbidden());
        }
        mvc.perform(get("/api/audit")).andExpect(status().isUnauthorized());
        JsonNode list = body(mvc.perform(get("/api/users").header("Authorization", commr())).andExpect(status().isOk()));
        assertThat(list.size()).isGreaterThanOrEqualTo(7);
        JsonNode me = body(mvc.perform(get("/api/auth/me").header("Authorization", commr())));
        assertThat(me.get("modules").toString()).contains("\"users\"", "\"audit\"");
        JsonNode jd = body(mvc.perform(get("/api/auth/me").header("Authorization", token("jd.news", Role.JD_NEWS))));
        assertThat(jd.get("modules").toString()).doesNotContain("\"users\"", "\"audit\"");
    }

    @Test
    void userCreationValidatesUsernameScopeAndPassword() throws Exception {
        long id = create(user("t.dio.mandya", "DIO", "district", "Mandya"));
        JsonNode u = body(mvc.perform(get("/api/users").header("Authorization", commr())));
        JsonNode row = null;
        for (JsonNode x : u) if (x.get("id").asLong() == id) row = x;
        assertThat(row).isNotNull();
        assertThat(row.get("district").asText()).isEqualTo("Mandya");
        assertThat(row.get("scope").asText()).isEqualTo("Mandya district only");
        assertThat(row.get("mustChangePassword").asBoolean()).isTrue();

        // unique usernames (case-insensitive)
        send(commr(), "/api/users", user("T.DIO.MANDYA", "DIO", "district", "Mandya")).andExpect(status().isBadRequest());
        // scope must match reference data
        send(commr(), "/api/users", user("t.dio.x", "DIO", "district", "Atlantis")).andExpect(status().isBadRequest());
        send(commr(), "/api/users", user("t.dio.y", "DIO", null, null)).andExpect(status().isBadRequest());
        send(commr(), "/api/users", user("t.nodal.x", "DEPT_NODAL", "department", "Space")).andExpect(status().isBadRequest());
        send(commr(), "/api/users", user("t.vendor.x", "VENDOR", "vendorId", "ZZ-999")).andExpect(status().isBadRequest());
        JsonNode v = body(send(commr(), "/api/users", user("t.vendor.ok", "VENDOR", "vendorId", "pr-k01")).andExpect(status().isOk()));
        assertThat(v.get("vendorId").asText()).isEqualTo("PR-K01");
        JsonNode n = body(send(commr(), "/api/users", user("t.nodal.ok", "DEPT_NODAL", "department", "Energy")).andExpect(status().isOk()));
        assertThat(n.get("department").asText()).isEqualTo("Energy");
        // a role that has no scope drops stray scope fields
        JsonNode jd = body(send(commr(), "/api/users", user("t.jd.ok", "JD_NEWS", "district", "Mandya")).andExpect(status().isOk()));
        assertThat(jd.get("district").isNull()).isTrue();
        // bad username and weak passwords
        send(commr(), "/api/users", user("a b", "JD_NEWS", null, null)).andExpect(status().isBadRequest());
        Map<String, Object> weak = user("t.weak", "JD_NEWS", null, null);
        weak.put("password", "abcdefgh");
        send(commr(), "/api/users", weak).andExpect(status().isBadRequest());
        weak.put("password", "ab1");
        send(commr(), "/api/users", weak).andExpect(status().isBadRequest());

        // edit role and scope: DIO → nodal officer
        JsonNode ed = body(send(commr(), "/api/users/" + id, Map.of("displayName", "Moved", "role", "DEPT_NODAL", "department", "Health & Family Welfare"))
                .andExpect(status().isOk()));
        assertThat(ed.get("role").asText()).isEqualTo("DEPT_NODAL");
        assertThat(ed.get("district").isNull()).isTrue();
        // the audit log records it
        JsonNode audit = body(mvc.perform(get("/api/audit?action=user&user=commr.dipr").header("Authorization", commr())).andExpect(status().isOk()));
        assertThat(audit.get("total").asInt()).isGreaterThanOrEqualTo(2);
        assertThat(audit.get("items").get(0).get("action").asText()).isEqualTo("user.update");
        mvc.perform(get("/api/audit?from=2026-13-01").header("Authorization", commr())).andExpect(status().isBadRequest());
    }

    @Test
    void cannotDeactivateOrDemoteYourselfAndDeactivatedUsersCannotSignIn() throws Exception {
        JsonNode list = body(mvc.perform(get("/api/users").header("Authorization", commr())));
        long self = 0;
        for (JsonNode x : list) if (x.get("username").asText().equals("commr.dipr")) self = x.get("id").asLong();
        send(commr(), "/api/users/" + self + "/active", Map.of("active", false)).andExpect(status().isBadRequest());
        send(commr(), "/api/users/" + self, Map.of("role", "JD_NEWS")).andExpect(status().isBadRequest());

        long id = create(user("t.film.off", "FILM_SECTION", null, null));
        login("t.film.off", "start1234").andExpect(status().isOk());
        String tok = "Bearer " + jwt.issue("t.film.off", Role.FILM_SECTION);
        mvc.perform(get("/api/auth/me").header("Authorization", tok)).andExpect(status().isOk());
        JsonNode off = body(send(commr(), "/api/users/" + id + "/active", Map.of("active", false)).andExpect(status().isOk()));
        assertThat(off.get("active").asBoolean()).isFalse();
        // existing sessions stop at once, and sign-in is refused
        mvc.perform(get("/api/auth/me").header("Authorization", tok)).andExpect(status().isUnauthorized());
        login("t.film.off", "start1234").andExpect(status().isUnauthorized());
        send(commr(), "/api/users/" + id + "/active", Map.of("active", true)).andExpect(status().isOk());
        login("t.film.off", "start1234").andExpect(status().isOk());

        // reset password gives a one-time temporary password that works and the old one stops working
        String temp = body(send(commr(), "/api/users/" + id + "/reset-password", Map.of()).andExpect(status().isOk())).get("temporaryPassword").asText();
        login("t.film.off", "start1234").andExpect(status().isUnauthorized());
        JsonNode in = body(login("t.film.off", temp).andExpect(status().isOk()));
        assertThat(in.get("mustChangePassword").asBoolean()).isTrue();
        JsonNode row = null;
        for (JsonNode x : body(mvc.perform(get("/api/users").header("Authorization", commr())))) if (x.get("id").asLong() == id) row = x;
        assertThat(row.get("lastSignInAt").isNull()).isFalse();
    }

    @Test
    void everyUserCanChangeTheirOwnPassword() throws Exception {
        create(user("t.pw.user", "JD_NEWS", null, null));
        String tok = "Bearer " + jwt.issue("t.pw.user", Role.JD_NEWS);
        send(tok, "/api/auth/password", Map.of("currentPassword", "wrong1234", "newPassword", "fresh2026x")).andExpect(status().isBadRequest());
        send(tok, "/api/auth/password", Map.of("currentPassword", "start1234", "newPassword", "short1")).andExpect(status().isBadRequest());
        send(tok, "/api/auth/password", Map.of("currentPassword", "start1234", "newPassword", "nodigitshere")).andExpect(status().isBadRequest());
        send(tok, "/api/auth/password", Map.of("currentPassword", "start1234", "newPassword", "start1234")).andExpect(status().isBadRequest());
        send(tok, "/api/auth/password", Map.of("currentPassword", "start1234", "newPassword", "fresh2026x")).andExpect(status().isOk());
        login("t.pw.user", "start1234").andExpect(status().isUnauthorized());
        JsonNode in = body(login("t.pw.user", "fresh2026x").andExpect(status().isOk()));
        assertThat(in.get("mustChangePassword").asBoolean()).isFalse();
        mvc.perform(post("/api/auth/password").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
    }

    @Test
    void fiveWrongPasswordsLockTheLoginForFifteenMinutes() throws Exception {
        long id = create(user("t.lock.me", "JD_NEWS", null, null));
        for (int i = 0; i < 4; i++) {
            JsonNode r = body(login("t.lock.me", "nope12345").andExpect(status().isUnauthorized()));
            assertThat(r.get("message").asText()).contains("wrong");
        }
        // a correct password in between resets the count
        login("t.lock.me", "start1234").andExpect(status().isOk());
        for (int i = 0; i < 4; i++) login("t.lock.me", "nope12345").andExpect(status().isUnauthorized());
        JsonNode locked = body(login("t.lock.me", "nope12345").andExpect(status().isUnauthorized()));
        assertThat(locked.get("code").asText()).isEqualTo("locked");
        assertThat(locked.get("message").asText()).contains("Try again after");
        // the right password is refused while locked
        assertThat(body(login("t.lock.me", "start1234").andExpect(status().isUnauthorized())).get("code").asText()).isEqualTo("locked");
        JsonNode row = null;
        for (JsonNode x : body(mvc.perform(get("/api/users").header("Authorization", commr())))) if (x.get("id").asLong() == id) row = x;
        assertThat(row.get("locked").asBoolean()).isTrue();
        long retry = java.time.Instant.parse(locked.get("retryAt").asText()).getEpochSecond() - java.time.Instant.now().getEpochSecond();
        assertThat(retry).isBetween(14 * 60L, 15 * 60L);
        // the Commissioner can unlock
        send(commr(), "/api/users/" + id + "/unlock", Map.of()).andExpect(status().isOk());
        login("t.lock.me", "start1234").andExpect(status().isOk());
        JsonNode audit = body(mvc.perform(get("/api/audit?action=login.locked&user=t.lock.me").header("Authorization", commr())));
        assertThat(audit.get("total").asInt()).isEqualTo(1);
    }
}
