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

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Round-2 workflows: ad-flag review outcomes, closing claims, escalation resolution and HQ tasks. */
@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:vaarta-test;DB_CLOSE_DELAY=-1", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class OutreachAuditTest {
    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired ObjectMapper json;

    private String token(String user, Role role) { return "Bearer " + jwt.issue(user, role); }
    private String commr() { return token("commr.dipr", Role.COMMISSIONER); }
    private String jd() { return token("jd.news", Role.JD_NEWS); }
    private String dd() { return token("dd.accounts", Role.DD_ACCOUNTS); }
    private String dio() { return token("dio.raichur", Role.DIO); }

    private JsonNode read(String auth, String path) throws Exception {
        return json.readTree(mvc.perform(get(path).header("Authorization", auth)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private ResultActions send(String auth, String path, Object body) throws Exception {
        return mvc.perform(post(path).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    private JsonNode ok(ResultActions r) throws Exception {
        return json.readTree(r.andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    @Test
    void adFlagReviewOutcomeIsRecordedByAccountsOnly() throws Exception {
        JsonNode flags = read(commr(), "/api/ads/flags");
        // the last flag still waiting for review (sample data also holds older flags that were already decided)
        String ro = null;
        for (JsonNode f : flags) if ("Flagged".equals(f.get("reviewStatus").asText())) ro = f.get("ro").asText();
        // Not sent yet: no decision possible.
        send(dd(), "/api/ads/flags/decide", Map.of("ro", ro, "outcome", "cleared")).andExpect(status().isBadRequest());
        JsonNode sent = ok(send(commr(), "/api/ads/flags/review", Map.of("ro", ro)));
        assertThat(sent.get("reviewStatus").asText()).isEqualTo("Sent for review");
        assertThat(sent.get("sentBy").asText()).isNotBlank();
        send(commr(), "/api/ads/flags/review", Map.of("ro", ro)).andExpect(status().isBadRequest());
        // Only the Deputy Director (Accounts) decides.
        send(commr(), "/api/ads/flags/decide", Map.of("ro", ro, "outcome", "cleared")).andExpect(status().isForbidden());
        send(jd(), "/api/ads/flags/decide", Map.of("ro", ro, "outcome", "cleared")).andExpect(status().isForbidden());
        send(dio(), "/api/ads/flags/decide", Map.of("ro", ro, "outcome", "cleared")).andExpect(status().isForbidden());
        send(dd(), "/api/ads/flags/decide", Map.of("ro", ro, "outcome", "bogus")).andExpect(status().isBadRequest());
        send(dd(), "/api/ads/flags/decide", Map.of("ro", ro, "outcome", "withheld")).andExpect(status().isBadRequest());
        JsonNode w = ok(send(dd(), "/api/ads/flags/decide", Map.of("ro", ro, "outcome", "withheld", "note", "Proof photo is stale")));
        assertThat(w.get("reviewStatus").asText()).isEqualTo("Payment withheld");
        assertThat(w.get("outcomeNote").asText()).isEqualTo("Proof photo is stale");
        assertThat(w.get("decidedBy").asText()).isNotBlank();
        JsonNode r = ok(send(dd(), "/api/ads/flags/decide", Map.of("ro", ro, "outcome", "resolved", "note", "Fresh proof received")));
        assertThat(r.get("reviewStatus").asText()).isEqualTo("Resolved");
        send(dd(), "/api/ads/flags/decide", Map.of("ro", ro, "outcome", "cleared")).andExpect(status().isBadRequest());
        // Persisted.
        JsonNode again = read(dd(), "/api/ads/flags");
        for (JsonNode f : again) if (f.get("ro").asText().equals(ro)) assertThat(f.get("reviewStatus").asText()).isEqualTo("Resolved");
    }

    @Test
    void claimsCloseWithoutActionOrAfterTheDistrictHandledThem() throws Exception {
        String id = ok(send(dio(), "/api/tipline/claims", Map.of("text", "Not a public matter", "lang", "Kannada", "district", "Raichur", "category", "Scheme rumour"))).get("id").asText();
        JsonNode c = ok(send(dio(), "/api/tipline/claims/" + id + "/transition", Map.of("to", "Closed", "note", "Private dispute")));
        assertThat(c.get("status").asText()).isEqualTo("Closed");
        assertThat(c.get("verdict").asText()).isEqualTo("Not of public interest");
        send(dio(), "/api/tipline/claims/" + id + "/edit", Map.of("verdict", "False")).andExpect(status().isBadRequest());
        send(dio(), "/api/tipline/claims/" + id + "/transition", Map.of("to", "Closed")).andExpect(status().isBadRequest());

        String esc = ok(send(dio(), "/api/tipline/claims", Map.of("text", "River flood rumour", "lang", "Kannada", "district", "Raichur", "category", "Public safety"))).get("id").asText();
        ok(send(dio(), "/api/tipline/claims/" + esc + "/transition", Map.of("to", "Escalated")));
        JsonNode h = ok(send(jd(), "/api/tipline/claims/" + esc + "/transition", Map.of("to", "Closed")));
        assertThat(h.get("verdict").asText()).isEqualTo("Handled by district administration");

        send(dio(), "/api/tipline/claims", Map.of("text", "x", "lang", "Klingon", "district", "Raichur", "category", "Scheme rumour")).andExpect(status().isBadRequest());
        send(dio(), "/api/tipline/claims", Map.of("text", "x", "lang", "Kannada", "district", "Raichur", "category", "Gossip")).andExpect(status().isBadRequest());
        send(dio(), "/api/tipline/claims", Map.of("text", "x", "lang", "Kannada", "district", "Raichur", "category", "Scheme rumour", "forwards", -4)).andExpect(status().isBadRequest());
    }

    @Test
    void escalationsAreResolvedInTheirDistrict() throws Exception {
        long mine = ok(send(dio(), "/api/offices/feed", Map.of("type", "esc", "note", "GRV-TEST · pension not credited"))).get("id").asLong();
        long pulse = ok(send(dio(), "/api/offices/feed", Map.of("type", "pulse", "note", "Pulse note", "sentiment", "Mixed"))).get("id").asLong();
        long other = ok(send(commr(), "/api/offices/feed", Map.of("type", "esc", "district", "Mysuru", "note", "Mysuru escalation"))).get("id").asLong();
        send(dio(), "/api/offices/feed", Map.of("type", "pulse", "note", "x", "sentiment", "Angry")).andExpect(status().isBadRequest());
        send(dio(), "/api/offices/feed/" + other + "/resolve", Map.of()).andExpect(status().isForbidden());
        send(dio(), "/api/offices/feed/" + pulse + "/resolve", Map.of()).andExpect(status().isBadRequest());
        JsonNode r = ok(send(dio(), "/api/offices/feed/" + mine + "/resolve", Map.of("note", "Credited on 9 Oct")));
        assertThat(r.get("resolvedBy").asText()).isNotBlank();
        assertThat(r.get("resolution").asText()).isEqualTo("Credited on 9 Oct");
        send(commr(), "/api/offices/feed/" + mine + "/resolve", Map.of()).andExpect(status().isBadRequest());
        send(jd(), "/api/offices/feed/" + other + "/resolve", Map.of()).andExpect(status().isForbidden());
        ok(send(commr(), "/api/offices/feed/" + other + "/resolve", Map.of()));
    }

    @Test
    void hqTasksAreAssignedByHqAndClosedByTheOffice() throws Exception {
        JsonNode t = ok(send(commr(), "/api/offices/tasks", Map.of("district", "Raichur", "title", "Photos of the Dasara stall", "due", "2026-10-15")));
        assertThat(t.get("status").asText()).isEqualTo("Open");
        long id = t.get("id").asLong();
        long mysuru = ok(send(commr(), "/api/offices/tasks", Map.of("district", "Mysuru", "title", "Mysuru task", "due", "2026-10-15"))).get("id").asLong();
        send(dio(), "/api/offices/tasks", Map.of("district", "Raichur", "title", "x", "due", "2026-10-15")).andExpect(status().isForbidden());
        send(commr(), "/api/offices/tasks", Map.of("district", "Raichur", "title", "x", "due", "15/10/2026")).andExpect(status().isBadRequest());
        send(commr(), "/api/offices/tasks", Map.of("district", "Nowhere", "title", "x", "due", "2026-10-15")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/offices/tasks").header("Authorization", jd())).andExpect(status().isForbidden());
        for (JsonNode x : read(dio(), "/api/offices/tasks")) assertThat(x.get("district").asText()).isEqualTo("Raichur");
        send(dio(), "/api/offices/tasks/" + mysuru + "/done", Map.of()).andExpect(status().isForbidden());
        JsonNode d = ok(send(dio(), "/api/offices/tasks/" + id + "/done", Map.of("note", "Sent 40 photos")));
        assertThat(d.get("status").asText()).isEqualTo("Done");
        assertThat(d.get("doneBy").asText()).isNotBlank();
        send(dio(), "/api/offices/tasks/" + id + "/done", Map.of()).andExpect(status().isBadRequest());
    }
}
