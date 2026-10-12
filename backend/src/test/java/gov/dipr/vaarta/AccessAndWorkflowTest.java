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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** End-to-end checks of sign-in, role scoping, the tipline approval rule, uploads and agents against the seeded sample data. */
@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:vaarta-test;DB_CLOSE_DELAY=-1", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class AccessAndWorkflowTest {
    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired ObjectMapper json;

    private String token(String user, Role role) { return "Bearer " + jwt.issue(user, role); }
    private String commr() { return token("commr.dipr", Role.COMMISSIONER); }
    private String jd() { return token("jd.news", Role.JD_NEWS); }
    private String dio() { return token("dio.raichur", Role.DIO); }
    private String nodal() { return token("nodal.health", Role.DEPT_NODAL); }
    private String vendor() { return token("vendor.prk02", Role.VENDOR); }

    private JsonNode read(String auth, String path) throws Exception {
        return json.readTree(mvc.perform(get(path).header("Authorization", auth)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private ResultActions send(String auth, String path, Object body) throws Exception {
        return mvc.perform(post(path).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    @Test
    void signInNeedsTheSecurityCheckAndTheRightPassword() throws Exception {
        JsonNode cap = json.readTree(mvc.perform(post("/api/auth/captcha")).andReturn().getResponse().getContentAsString());
        String[] ab = cap.get("question").asText().split("\\+");
        int answer = Integer.parseInt(ab[0].trim()) + Integer.parseInt(ab[1].trim());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("username", "dio.raichur", "password", "demo@2026", "captchaId", cap.get("id").asText(), "captchaAnswer", String.valueOf(answer)))))
                .andExpect(status().isOk());
        // the same question cannot be used twice
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("username", "dio.raichur", "password", "demo@2026", "captchaId", cap.get("id").asText(), "captchaAnswer", String.valueOf(answer)))))
                .andExpect(status().isBadRequest());
        JsonNode cap2 = json.readTree(mvc.perform(post("/api/auth/captcha")).andReturn().getResponse().getContentAsString());
        String[] cd = cap2.get("question").asText().split("\\+");
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("username", "dio.raichur", "password", "wrong", "captchaId", cap2.get("id").asText(),
                        "captchaAnswer", String.valueOf(Integer.parseInt(cd[0].trim()) + Integer.parseInt(cd[1].trim()))))))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/meta")).andExpect(status().isUnauthorized());
    }

    @Test
    void districtOfficerSeesOnlyTheirDistrict() throws Exception {
        JsonNode orders = read(dio(), "/api/spend/orders");
        assertThat(orders.size()).isPositive();
        orders.forEach(o -> assertThat(o.get("district").asText()).isEqualTo("Raichur"));
        read(dio(), "/api/outreach/base").forEach(r -> assertThat(r.get("district").asText()).isEqualTo("Raichur"));
        read(dio(), "/api/registers/rti/rows").forEach(r -> assertThat(r.get("district").asText()).isEqualTo("Raichur"));
        // campaigns are not tied to places, so they are not district-filtered (as in the prototype)
        assertThat(read(dio(), "/api/registers/campaigns/rows").size()).isEqualTo(read(commr(), "/api/registers/campaigns/rows").size());
        // modules outside the role are refused
        mvc.perform(get("/api/registers/film/rows").header("Authorization", dio())).andExpect(status().isForbidden());
        mvc.perform(get("/api/ads/flags").header("Authorization", dio())).andExpect(status().isForbidden());
    }

    @Test
    void departmentAndVendorScopes() throws Exception {
        read(nodal(), "/api/spend/orders").forEach(o -> assertThat(o.get("department").asText()).isEqualTo("Health & Family Welfare"));
        read(nodal(), "/api/spend/budget").forEach(o -> assertThat(o.get("department").asText()).isEqualTo("Health & Family Welfare"));
        JsonNode vo = read(vendor(), "/api/spend/orders");
        assertThat(vo.size()).isPositive();
        vo.forEach(o -> assertThat(o.get("vendorId").asText()).isEqualTo("PR-K02"));
        mvc.perform(get("/api/registers/campaigns/rows").header("Authorization", vendor())).andExpect(status().isForbidden());
        assertThat(read(vendor(), "/api/uploads/datasets").size()).isZero();
    }

    @Test
    void onlyCommissionerOrJointDirectorPublishesAVerdict() throws Exception {
        JsonNode c = json.readTree(send(dio(), "/api/tipline/claims", Map.of("text", "Test rumour about a scheme", "lang", "Kannada", "district", "Raichur", "category", "Scheme rumour"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        String id = c.get("id").asText();
        send(dio(), "/api/tipline/claims", Map.of("text", "x", "lang", "Kannada", "district", "Mysuru", "category", "Scheme rumour")).andExpect(status().isForbidden());
        send(dio(), "/api/tipline/claims/" + id + "/transition", Map.of("to", "Triaged")).andExpect(status().isOk());
        send(dio(), "/api/tipline/claims/" + id + "/transition", Map.of("to", "Draft ready")).andExpect(status().isOk());
        send(dio(), "/api/tipline/claims/" + id + "/transition", Map.of("to", "Published")).andExpect(status().isForbidden());
        JsonNode pub = json.readTree(send(jd(), "/api/tipline/claims/" + id + "/transition", Map.of("to", "Published"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(pub.get("status").asText()).isEqualTo("Published");
        assertThat(pub.get("approvedBy").asText()).isNotBlank();
    }

    @Test
    void uploadValidatesRowsAgainstTheUsersScopeAndReplacesOnlyTheirRecords() throws Exception {
        long before = read(commr(), "/api/registers/rti/rows").size();
        long raichurBefore = read(dio(), "/api/registers/rti/rows").size();
        String csv = "RTI ID,Received on,Wing,Applicant type,District,Stage\n"
                + "RTI-T-1,01-10-2026,News,Citizen,Raichur,Received\n"
                + "RTI-T-2,01-10-2026,News,Citizen,Mysuru,Received\n"
                + "RTI-T-3,01-10-2026,Nowhere,Citizen,Raichur,Received\n";
        MockMultipartFile f = new MockMultipartFile("file", "rti.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8));
        JsonNode rep = json.readTree(mvc.perform(multipart("/api/uploads/rti/validate").file(f).header("Authorization", dio()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(rep.get("total").asInt()).isEqualTo(3);
        assertThat(rep.get("goodCount").asInt()).isEqualTo(1);
        assertThat(rep.get("badRows").asInt()).isEqualTo(2);
        JsonNode batch = json.readTree(send(dio(), "/api/uploads/" + rep.get("uploadId").asText() + "/import", Map.of("mode", "replace"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(batch.get("rowsImported").asInt()).isEqualTo(1);
        assertThat(read(dio(), "/api/registers/rti/rows").size()).isEqualTo(1);
        // other districts' records are untouched by a district officer's replace
        assertThat(read(commr(), "/api/registers/rti/rows").size()).isEqualTo(before - raichurBefore + 1);
        mvc.perform(get("/api/uploads/rti/template").header("Authorization", dio())).andExpect(status().isOk());
        // the state budget is not uploadable from a district login
        mvc.perform(get("/api/uploads/budget/template").header("Authorization", dio())).andExpect(status().isForbidden());
    }

    @Test
    void agentRunStopsForApprovalAndApprovalPublishesARelease() throws Exception {
        int releases = read(jd(), "/api/press/releases").size();
        JsonNode run = json.readTree(send(jd(), "/api/agents/press/runs", Map.of()).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(run.get("status").asText()).isEqualTo("Needs approval");
        send(jd(), "/api/agents/runs/" + run.get("id").asText() + "/approve", Map.of()).andExpect(status().isOk());
        assertThat(read(jd(), "/api/press/releases").size()).isEqualTo(releases + 1);
        send(dio(), "/api/agents/press/runs", Map.of()).andExpect(status().isForbidden());
    }

    @Test
    void auditFlagsGoForReviewOnlyFromAccountsOrCommissioner() throws Exception {
        String dd = token("dd.accounts", Role.DD_ACCOUNTS);
        String ro = read(dd, "/api/ads/flags").get(0).get("ro").asText();
        JsonNode f = json.readTree(send(dd, "/api/ads/flags/review", Map.of("ro", ro)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(f.get("reviewStatus").asText()).isEqualTo("Sent for review");
        send(jd(), "/api/ads/flags/review", Map.of("ro", ro)).andExpect(status().isForbidden());
    }
}
