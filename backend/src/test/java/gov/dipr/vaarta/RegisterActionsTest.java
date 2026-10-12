package gov.dipr.vaarta;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import gov.dipr.vaarta.repo.AuditEventRepo;
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
import java.util.function.Predicate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Named register actions (renew, return for proof, reply, UC received ...), the bill proof rule and the statewide count. */
@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:vaarta-regactions-test;DB_CLOSE_DELAY=-1", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class RegisterActionsTest {
    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired ObjectMapper json;
    @Autowired AuditEventRepo audit;

    private String token(String user, Role role) { return "Bearer " + jwt.issue(user, role); }
    private String commr() { return token("commr.dipr", Role.COMMISSIONER); }
    private String dd() { return token("dd.accounts", Role.DD_ACCOUNTS); }
    private String dio() { return token("dio.raichur", Role.DIO); }
    private String vendor() { return token("vendor.prk02", Role.VENDOR); }
    private String jd() { return token("jd.news", Role.JD_NEWS); }

    private JsonNode get(String auth, String path) throws Exception {
        return json.readTree(mvc.perform(mget(path).header("Authorization", auth)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder mget(String p) {
        return org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(p);
    }

    private ResultActions act(String auth, String reg, long id, String action) throws Exception {
        return mvc.perform(post("/api/registers/" + reg + "/rows/" + id + "/action").header("Authorization", auth)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("action", action))));
    }

    private JsonNode body(ResultActions r) throws Exception { return json.readTree(r.andReturn().getResponse().getContentAsString()); }

    private JsonNode first(String auth, String reg, Predicate<JsonNode> p) throws Exception {
        for (JsonNode r : get(auth, "/api/registers/" + reg + "/rows")) if (p.test(r)) return r;
        throw new AssertionError("no matching " + reg + " row");
    }

    @Test
    void actionsAreListedPerRegister() throws Exception {
        JsonNode a = get(dd(), "/api/registers/empanel/actions");
        assertThat(a.get(0).get("key").asText()).isEqualTo("renew");
        assertThat(get(commr(), "/api/registers/campaigns/actions").size()).isZero();
        mvc.perform(mget("/api/registers/empanel/actions").header("Authorization", jd())).andExpect(status().isForbidden());
    }

    @Test
    void renewingAnEmpanelmentNeedsAnAuditAndExtendsByAYear() throws Exception {
        long before = audit.count();
        // an active vendor is suspended, then renewed: validity runs a year from its current end date (still in the future)
        JsonNode due = first(dd(), "empanel", r -> "Active".equals(r.get("stage").asText()) && r.get("audited").asDouble() > 0);
        act(dd(), "empanel", due.get("_id").asLong(), "suspend").andExpect(status().isOk());
        JsonNode r = body(act(dd(), "empanel", due.get("_id").asLong(), "renew").andExpect(status().isOk()));
        assertThat(r.get("stage").asText()).isEqualTo("Active");
        assertThat(r.get("validTill").asText()).isEqualTo(java.time.LocalDate.parse(due.get("validTill").asText()).plusYears(1).toString());
        JsonNode expired = first(dd(), "empanel", x -> "Expired".equals(x.get("stage").asText()) && x.get("audited").asDouble() > 0);
        assertThat(body(act(dd(), "empanel", expired.get("_id").asLong(), "renew").andExpect(status().isOk())).get("validTill").asText())
                .isEqualTo("2027-10-07");
        JsonNode noAudit = first(dd(), "empanel", x -> !"Active".equals(x.get("stage").asText()) && x.get("audited").asDouble() == 0);
        assertThat(body(act(dd(), "empanel", noAudit.get("_id").asLong(), "renew").andExpect(status().isBadRequest())).get("message").asText())
                .contains("audit");
        // an action from the wrong stage, an unknown action and a vendor are refused
        act(dd(), "empanel", due.get("_id").asLong(), "renew").andExpect(status().isBadRequest());
        act(dd(), "empanel", due.get("_id").asLong(), "explode").andExpect(status().isBadRequest());
        act(vendor(), "empanel", due.get("_id").asLong(), "suspend").andExpect(status().isForbidden());
        assertThat(audit.count()).isEqualTo(before + 3);
    }

    @Test
    void billsWithoutProofCannotBeSanctionedOrPaid() throws Exception {
        JsonNode b = first(dd(), "bills", r -> "Received".equals(r.get("stage").asText()));
        long id = b.get("_id").asLong();
        JsonNode ret = body(act(dd(), "bills", id, "return").andExpect(status().isOk()));
        assertThat(ret.get("stage").asText()).isEqualTo("Returned");
        assertThat(ret.get("proof").asText()).isEqualTo("Missing");
        mvc.perform(post("/api/registers/bills/rows/" + id + "/advance").header("Authorization", dd()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"stage\":\"Paid\"}")).andExpect(status().isBadRequest());
        Map<String, Object> edit = json.convertValue(ret, Map.class);
        edit.put("stage", "Sanctioned");
        assertThat(body(mvc.perform(put("/api/registers/bills/rows/" + id).header("Authorization", dd()).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(edit))).andExpect(status().isBadRequest())).get("errors").has("proof")).isTrue();
        JsonNode back = body(act(dd(), "bills", id, "proof").andExpect(status().isOk()));
        assertThat(back.get("stage").asText()).isEqualTo("Proof check");
        assertThat(back.get("proof").asText()).isEqualTo("Attached");
    }

    @Test
    void rtiGrantsAndScope() throws Exception {
        JsonNode rti = first(dio(), "rti", r -> "Information sought".equals(r.get("stage").asText()));
        assertThat(body(act(dio(), "rti", rti.get("_id").asLong(), "reply").andExpect(status().isOk())).get("stage").asText()).isEqualTo("Replied");
        assertThat(body(act(dio(), "rti", rti.get("_id").asLong(), "close").andExpect(status().isOk())).get("stage").asText()).isEqualTo("Closed");
        JsonNode other = first(commr(), "rti", r -> !"Raichur".equals(r.get("district").asText()) && "Received".equals(r.get("stage").asText()));
        act(dio(), "rti", other.get("_id").asLong(), "reply").andExpect(status().isForbidden());

        JsonNode overdue = first(dd(), "grants", r -> "UC overdue".equals(r.get("stage").asText()));
        assertThat(body(act(dd(), "grants", overdue.get("_id").asLong(), "uc").andExpect(status().isOk())).get("stage").asText()).isEqualTo("UC received");
        JsonNode notYet = first(dd(), "grants", r -> "UC due".equals(r.get("stage").asText()) && r.get("ucDue").asText().compareTo("2026-10-07") > 0);
        act(dd(), "grants", notYet.get("_id").asLong(), "overdue").andExpect(status().isBadRequest());
    }

    @Test
    void districtOfficersGetTheStatewideCount() throws Exception {
        long all = 0;
        for (JsonNode r : get(commr(), "/api/registers/rti/rows")) if ("Statewide".equals(r.get("district").asText())) all++;
        assertThat(all).isPositive();
        assertThat(get(dio(), "/api/registers/rti/statewide").get("count").asLong()).isEqualTo(all);
        mvc.perform(mget("/api/registers/film/statewide").header("Authorization", dio())).andExpect(status().isForbidden());
    }
}
