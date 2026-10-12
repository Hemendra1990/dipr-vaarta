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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.StreamSupport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Cancelling release orders, bill amounts in spend figures, and the replace count shown before an upload. */
@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:vaarta-spend-cancel-test;DB_CLOSE_DELAY=-1", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class SpendCancelTest {
    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired ObjectMapper json;
    @Autowired AuditEventRepo auditRepo;

    private String token(String user, Role role) { return "Bearer " + jwt.issue(user, role); }
    private String commr() { return token("commr.dipr", Role.COMMISSIONER); }
    private String dd() { return token("dd.accounts", Role.DD_ACCOUNTS); }
    private String dio() { return token("dio.raichur", Role.DIO); }
    private String nodal() { return token("nodal.health", Role.DEPT_NODAL); }
    private String vendor() { return token("vendor.prk02", Role.VENDOR); }

    private JsonNode read(String auth, String path) throws Exception {
        return json.readTree(mvc.perform(get(path).header("Authorization", auth)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private ResultActions send(String auth, String path, Object body) throws Exception {
        return mvc.perform(post(path).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    private JsonNode ok(ResultActions r) throws Exception {
        return json.readTree(r.andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private long issue(double amount) throws Exception {
        Map<String, Object> m = new HashMap<>();
        m.put("campaignId", "CMP-C" + (int) (Math.random() * 1e6)); m.put("campaign", "Cancel test"); m.put("ctype", "Civic awareness");
        m.put("department", "Health & Family Welfare"); m.put("channel", "Print"); m.put("vendorId", "PR-K02"); m.put("district", "Statewide");
        m.put("month", "2026-09"); m.put("amount", amount);
        return ok(send(dd(), "/api/spend/orders", m)).get("id").asLong();
    }

    private JsonNode find(JsonNode list, long id) {
        return StreamSupport.stream(list.spliterator(), false).filter(o -> o.get("id").asLong() == id).findFirst().orElse(null);
    }

    @Test
    void anIssuedOrderCanBeCancelledWithAReasonByAccountsOrCommissioner() throws Exception {
        long id = issue(12);
        long audits = auditRepo.count();
        // only Commissioner and DD Accounts, and a reason is required
        send(vendor(), "/api/spend/orders/" + id + "/cancel", Map.of("reason", "x")).andExpect(status().isForbidden());
        send(nodal(), "/api/spend/orders/" + id + "/cancel", Map.of("reason", "x")).andExpect(status().isForbidden());
        send(dio(), "/api/spend/orders/" + id + "/cancel", Map.of("reason", "x")).andExpect(status().isForbidden());
        send(dd(), "/api/spend/orders/" + id + "/cancel", Map.of("reason", "  ")).andExpect(status().isBadRequest());
        send(dd(), "/api/spend/orders/" + id + "/cancel", Map.of()).andExpect(status().isBadRequest());
        send(dd(), "/api/spend/orders/999999/cancel", Map.of("reason", "x")).andExpect(status().isNotFound());

        JsonNode c = ok(send(commr(), "/api/spend/orders/" + id + "/cancel", Map.of("reason", "Issued twice by mistake")));
        assertThat(c.get("status").asText()).isEqualTo("Cancelled");
        assertThat(c.get("cancelledBy").asText()).isEqualTo("commr.dipr");
        assertThat(c.get("cancelReason").asText()).isEqualTo("Issued twice by mistake");
        assertThat(c.get("history").get(1).get("action").asText()).isEqualTo("Release order cancelled");
        assertThat(auditRepo.count()).isEqualTo(audits + 1);

        // no second cancel, no bill, no payment
        send(dd(), "/api/spend/orders/" + id + "/cancel", Map.of("reason", "again")).andExpect(status().isBadRequest());
        send(vendor(), "/api/spend/orders/" + id + "/bill", Map.of("billNo", "B-9", "amount", 12)).andExpect(status().isBadRequest());
        send(dd(), "/api/spend/orders/" + id + "/pay", Map.of("reference", "U1")).andExpect(status().isBadRequest());

        // left out of the default list (every spend figure), listed on request; the vendor sees it as cancelled
        assertThat(find(read(commr(), "/api/spend/orders"), id)).isNull();
        assertThat(find(read(commr(), "/api/spend/orders?cancelled=true"), id).get("status").asText()).isEqualTo("Cancelled");
        assertThat(find(read(vendor(), "/api/spend/orders"), id)).isNull();
        assertThat(find(read(vendor(), "/api/spend/orders?cancelled=true"), id).get("cancelReason").asText()).isEqualTo("Issued twice by mistake");
    }

    @Test
    void billedOrPaidOrdersCannotBeCancelledAndCountAtTheBillAmount() throws Exception {
        long id = issue(20);
        JsonNode issued = find(read(commr(), "/api/spend/orders"), id);
        assertThat(issued.get("amount").asDouble()).isEqualTo(20.0);
        assertThat(issued.get("orderAmount").asDouble()).isEqualTo(20.0);

        ok(send(vendor(), "/api/spend/orders/" + id + "/bill", Map.of("billNo", "B-77", "amount", 18.5)));
        send(dd(), "/api/spend/orders/" + id + "/cancel", Map.of("reason", "late")).andExpect(status().isBadRequest());
        JsonNode billed = find(read(commr(), "/api/spend/orders"), id);
        assertThat(billed.get("amount").asDouble()).isEqualTo(18.5);
        assertThat(billed.get("orderAmount").asDouble()).isEqualTo(20.0);

        ok(send(dd(), "/api/spend/orders/" + id + "/pay", Map.of("reference", "UTR-1")));
        send(commr(), "/api/spend/orders/" + id + "/cancel", Map.of("reason", "late")).andExpect(status().isBadRequest());
        assertThat(find(read(commr(), "/api/spend/orders"), id).get("amount").asDouble()).isEqualTo(18.5);

        // seed rows have no bill amount and keep their order amount
        StreamSupport.stream(read(commr(), "/api/spend/orders").spliterator(), false).filter(o -> !o.has("billAmount"))
                .limit(50).forEach(o -> assertThat(o.get("amount").asDouble()).isEqualTo(o.get("orderAmount").asDouble()));
    }

    @Test
    void validateReportsHowManyRecordsAReplaceWouldRemove() throws Exception {
        // campaigns are a geo-all register: a DIO sees every campaign but a replace removes Raichur rows only
        JsonNode ds = StreamSupport.stream(read(dio(), "/api/uploads/datasets").spliterator(), false)
                .filter(d -> d.get("id").asText().equals("campaigns")).findFirst().orElseThrow();
        String headings = String.join(",", StreamSupport.stream(ds.get("schema").spliterator(), false).map(f -> "\"" + f.get("h").asText() + "\"").toList());
        MockMultipartFile f = new MockMultipartFile("file", "c.csv", "text/csv", (headings + "\n").getBytes(StandardCharsets.UTF_8));
        JsonNode rep = json.readTree(mvc.perform(multipart("/api/uploads/campaigns/validate").file(f).header("Authorization", dio()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(rep.get("existing").asLong()).isEqualTo(ds.get("count").asLong());
        assertThat(rep.get("replaceCount").asLong()).isLessThanOrEqualTo(rep.get("existing").asLong());
        assertThat(rep.get("uploadId").isNull()).isTrue();
    }
}
