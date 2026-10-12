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

import java.util.HashMap;
import java.util.Map;
import java.util.stream.StreamSupport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Release-order workflow (issue, bill, pay), budget editing, and the role and scope rules around them. */
@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:vaarta-spend-test;DB_CLOSE_DELAY=-1", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class SpendTest {
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

    private ResultActions put(String auth, String path, Object body) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(path).header("Authorization", auth)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    private JsonNode ok(ResultActions r) throws Exception {
        return json.readTree(r.andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private Map<String, Object> ro(String vendorId, String district, String channel, double amount) {
        Map<String, Object> m = new HashMap<>();
        m.put("campaignId", "CMP-T" + (int) (Math.random() * 1e6)); m.put("campaign", "Test campaign"); m.put("ctype", "Civic awareness");
        m.put("department", "Health & Family Welfare"); m.put("channel", channel); m.put("vendorId", vendorId); m.put("district", district);
        m.put("month", "2026-09"); m.put("amount", amount);
        return m;
    }

    @Test
    void issueBillAndPayAReleaseOrder() throws Exception {
        int maxSerial = StreamSupport.stream(read(commr(), "/api/spend/orders").spliterator(), false)
                .mapToInt(o -> Integer.parseInt(o.get("roNo").asText().substring(6))).max().orElse(0);
        long audits = auditRepo.count();

        JsonNode o = ok(send(dd(), "/api/spend/orders", ro("PR-K02", "Statewide", "Print", 20)));
        assertThat(o.get("status").asText()).isEqualTo("RO issued");
        assertThat(o.get("roNo").asText()).isEqualTo(String.format("RO/26/%05d", maxSerial + 1));
        assertThat(o.get("fy").asText()).isEqualTo("2026-27");
        assertThat(o.get("quarter").asText()).isEqualTo("Q2");
        assertThat(o.get("vendor").asText()).isEqualTo("PR-K02 · Kannada daily");
        long id = o.get("id").asLong();

        // accounts cannot pay before a bill; only the vendor bills
        send(dd(), "/api/spend/orders/" + id + "/pay", Map.of("reference", "UTR1")).andExpect(status().isBadRequest());
        send(dd(), "/api/spend/orders/" + id + "/bill", Map.of("billNo", "B-1", "amount", 20)).andExpect(status().isForbidden());
        // more than RO + 5% is refused
        send(vendor(), "/api/spend/orders/" + id + "/bill", Map.of("billNo", "B-1", "amount", 21.01)).andExpect(status().isBadRequest());
        send(vendor(), "/api/spend/orders/" + id + "/bill", Map.of("amount", 20)).andExpect(status().isBadRequest());
        JsonNode billed = ok(send(vendor(), "/api/spend/orders/" + id + "/bill", Map.of("billNo", "B-1", "amount", 21)));
        assertThat(billed.get("status").asText()).isEqualTo("Billed");
        assertThat(billed.get("billAmount").asDouble()).isEqualTo(21.0);
        send(vendor(), "/api/spend/orders/" + id + "/bill", Map.of("billNo", "B-2", "amount", 20)).andExpect(status().isBadRequest());

        // the nodal officer for Health can see it but not pay it; the vendor cannot pay either
        assertThat(read(nodal(), "/api/spend/orders/" + id).get("status").asText()).isEqualTo("Billed");
        send(nodal(), "/api/spend/orders/" + id + "/pay", Map.of("reference", "UTR1")).andExpect(status().isForbidden());
        send(vendor(), "/api/spend/orders/" + id + "/pay", Map.of("reference", "UTR1")).andExpect(status().isForbidden());
        send(dd(), "/api/spend/orders/" + id + "/pay", Map.of()).andExpect(status().isBadRequest());
        send(dd(), "/api/spend/orders/" + id + "/pay", Map.of("reference", "UTR1", "paidOn", "2999-01-01")).andExpect(status().isBadRequest());

        JsonNode paid = ok(send(dd(), "/api/spend/orders/" + id + "/pay", Map.of("reference", "UTR-778")));
        assertThat(paid.get("status").asText()).isEqualTo("Paid");
        assertThat(paid.get("paymentRef").asText()).isEqualTo("UTR-778");
        assertThat(paid.get("history").size()).isEqualTo(3);
        send(dd(), "/api/spend/orders/" + id + "/pay", Map.of("reference", "UTR-779")).andExpect(status().isBadRequest());
        assertThat(auditRepo.count()).isEqualTo(audits + 3);
    }

    @Test
    void issueIsLimitedByRoleDistrictAndVendor() throws Exception {
        // nodal officer and vendor are read-only for orders
        send(nodal(), "/api/spend/orders", ro("PR-K02", "Statewide", "Print", 5)).andExpect(status().isForbidden());
        send(vendor(), "/api/spend/orders", ro("PR-K02", "Statewide", "Print", 5)).andExpect(status().isForbidden());
        send(token("jd.news", Role.JD_NEWS), "/api/spend/orders", ro("PR-K02", "Statewide", "Print", 5)).andExpect(status().isForbidden());

        // the DIO may issue only for Raichur, with a Raichur vendor
        send(dio(), "/api/spend/orders", ro("PR-K02", "Statewide", "Print", 5)).andExpect(status().isForbidden());
        String raichurVendor = StreamSupport.stream(read(commr(), "/api/spend/vendors").spliterator(), false)
                .filter(v -> v.get("district").asText().equals("Raichur")).findFirst().orElseThrow().get("id").asText();
        JsonNode v = StreamSupport.stream(read(commr(), "/api/spend/vendors").spliterator(), false)
                .filter(x -> x.get("id").asText().equals(raichurVendor)).findFirst().orElseThrow();
        JsonNode o = ok(send(dio(), "/api/spend/orders", ro(raichurVendor, "Raichur", v.get("channel").asText(), 3.5)));
        assertThat(o.get("district").asText()).isEqualTo("Raichur");
        assertThat(read(dio(), "/api/spend/orders/" + o.get("id").asLong()).get("roNo").asText()).isEqualTo(o.get("roNo").asText());

        // bad input
        send(commr(), "/api/spend/orders", ro("PR-K02", "Raichur", "Print", 5)).andExpect(status().isBadRequest()); // statewide vendor in a district
        send(commr(), "/api/spend/orders", ro("PR-K02", "Statewide", "Television", 5)).andExpect(status().isBadRequest()); // wrong channel
        send(commr(), "/api/spend/orders", ro("PR-K02", "Statewide", "Print", 0)).andExpect(status().isBadRequest());
        send(commr(), "/api/spend/orders", ro("XX-000", "Statewide", "Print", 5)).andExpect(status().isBadRequest());
        Map<String, Object> badMonth = ro("PR-K02", "Statewide", "Print", 5);
        badMonth.put("month", "2019-05");
        send(commr(), "/api/spend/orders", badMonth).andExpect(status().isBadRequest());
        Map<String, Object> badType = ro("PR-K02", "Statewide", "Print", 5);
        badType.put("ctype", "Not a type");
        send(commr(), "/api/spend/orders", badType).andExpect(status().isBadRequest());
    }

    @Test
    void vendorsAndDistrictUsersOnlyReachOrdersInTheirScope() throws Exception {
        JsonNode all = read(commr(), "/api/spend/orders");
        JsonNode other = StreamSupport.stream(all.spliterator(), false)
                .filter(o -> !o.get("vendorId").asText().equals("PR-K02") && o.get("status").asText().equals("RO issued") && !o.get("district").asText().equals("Raichur"))
                .findFirst().orElseThrow();
        long id = other.get("id").asLong();
        mvc.perform(get("/api/spend/orders/" + id).header("Authorization", vendor())).andExpect(status().isForbidden());
        mvc.perform(get("/api/spend/orders/" + id).header("Authorization", dio())).andExpect(status().isForbidden());
        send(vendor(), "/api/spend/orders/" + id + "/bill", Map.of("billNo", "X", "amount", 1)).andExpect(status().isForbidden());
        mvc.perform(get("/api/spend/orders/999999").header("Authorization", commr())).andExpect(status().isNotFound());
        read(vendor(), "/api/spend/orders").forEach(o -> assertThat(o.get("vendorId").asText()).isEqualTo("PR-K02"));
    }

    @Test
    void budgetLinesCanBeEditedByAccountsAndCommissionerOnly() throws Exception {
        Map<String, Object> body = Map.of("fy", "2026-27", "department", "Tourism", "channel", "Cinema", "budget", 42.5);
        put(nodal(), "/api/spend/budget", body).andExpect(status().isForbidden());
        put(dio(), "/api/spend/budget", body).andExpect(status().isForbidden());
        put(vendor(), "/api/spend/budget", body).andExpect(status().isForbidden());
        put(dd(), "/api/spend/budget", Map.of("fy", "2019-20", "department", "Tourism", "channel", "Cinema", "budget", 1)).andExpect(status().isBadRequest());
        put(dd(), "/api/spend/budget", Map.of("fy", "2026-27", "department", "Tourism", "channel", "Cinema", "budget", -1)).andExpect(status().isBadRequest());
        put(dd(), "/api/spend/budget", Map.of("fy", "2026-27", "department", "Nowhere", "channel", "Cinema", "budget", 1)).andExpect(status().isBadRequest());

        int before = read(commr(), "/api/spend/budget").size();
        ok(put(dd(), "/api/spend/budget", body));
        ok(put(commr(), "/api/spend/budget", Map.of("fy", "2026-27", "department", "Tourism", "channel", "Cinema", "budget", 50)));
        JsonNode lines = read(commr(), "/api/spend/budget");
        var match = StreamSupport.stream(lines.spliterator(), false)
                .filter(b -> b.get("fy").asText().equals("2026-27") && b.get("department").asText().equals("Tourism") && b.get("channel").asText().equals("Cinema")).toList();
        assertThat(match).hasSize(1);
        assertThat(match.get(0).get("budget").asDouble()).isEqualTo(50.0);
        assertThat(lines.size()).isBetween(before, before + 1);
    }
}
