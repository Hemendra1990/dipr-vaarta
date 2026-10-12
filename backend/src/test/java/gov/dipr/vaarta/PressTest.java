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

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Press office: drafting, approve & issue, media kits, pickup and who may do each. */
@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:vaarta-test;DB_CLOSE_DELAY=-1", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class PressTest {
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
        String s = r.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return s.isEmpty() ? null : json.readTree(s);
    }

    private Map<String, Object> draft(String district) {
        Map<String, Object> m = new HashMap<>();
        m.put("title", "Test release for " + district);
        m.put("dept", "Revenue");
        m.put("district", district);
        m.put("body", "Body text of the release.");
        m.put("language", "English");
        return m;
    }

    private static int issuedNo(String id) { return Integer.parseInt(id.substring(4)); }

    @Test
    void draftThenIssueGivesTheNextNumberAndPrototypeReach() throws Exception {
        JsonNode d = ok(send(jd(), "/api/press/releases", draft("State")));
        assertThat(d.get("status").asText()).isEqualTo("Draft");
        assertThat(d.get("id").asText()).startsWith("DRF-");
        assertThat(d.get("reach").asInt()).isZero();
        assertThat(d.get("draftedBy").asText()).isEqualTo("Joint Director (News)");

        long issuedBefore = 0;
        int maxNo = 0;
        for (JsonNode r : read(commr(), "/api/press/releases")) {
            // supplementary sample releases (REL-1858 and below) do not advance the prototype's counter
            if (!"Draft".equals(r.get("status").asText())) { if (issuedNo(r.get("id").asText()) >= 1859) issuedBefore++; maxNo = Math.max(maxNo, issuedNo(r.get("id").asText())); }
        }
        JsonNode p = ok(send(commr(), "/api/press/releases/" + d.get("id").asText() + "/issue", Map.of()));
        assertThat(p.get("status").asText()).isEqualTo("Issued");
        assertThat(issuedNo(p.get("id").asText())).isGreaterThanOrEqualTo((int) (1875 + issuedBefore)).isGreaterThan(maxNo);
        assertThat(p.get("reach").asInt()).isEqualTo(1210);
        assertThat(p.get("approvedBy").asText()).isEqualTo("Commissioner, DIPR");
        assertThat(p.get("issuedAt").isNull()).isFalse();
        assertThat(p.get("body").asText()).isEqualTo("Body text of the release.");
        // newest issued release is at the top of the list; the draft is gone
        JsonNode list = read(jd(), "/api/press/releases");
        assertThat(list.get(0).get("id").asText()).isEqualTo(p.get("id").asText());
        list.forEach(r -> assertThat(r.get("id").asText()).isNotEqualTo(d.get("id").asText()));
        // issuing twice is refused (the draft no longer exists)
        send(commr(), "/api/press/releases/" + d.get("id").asText() + "/issue", Map.of()).andExpect(status().isNotFound());
        send(commr(), "/api/press/releases/" + p.get("id").asText() + "/issue", Map.of()).andExpect(status().isBadRequest());

        JsonNode d2 = ok(send(commr(), "/api/press/releases", draft("Raichur")));
        JsonNode p2 = ok(send(jd(), "/api/press/releases/" + d2.get("id").asText() + "/issue", Map.of()));
        assertThat(p2.get("reach").asInt()).isEqualTo(58);
        assertThat(p2.get("approvedBy").asText()).isEqualTo("Joint Director (News)");
        assertThat(issuedNo(p2.get("id").asText())).isEqualTo(issuedNo(p.get("id").asText()) + 1);
    }

    @Test
    void onlyPressRolesDraftAndOnlyCommissionerOrJdIssue() throws Exception {
        send(dio(), "/api/press/releases", draft("Raichur")).andExpect(status().isForbidden());
        send(dd(), "/api/press/releases", draft("State")).andExpect(status().isForbidden());
        JsonNode d = ok(send(jd(), "/api/press/releases", draft("Mysuru")));
        String id = d.get("id").asText();
        send(dd(), "/api/press/releases/" + id + "/issue", Map.of()).andExpect(status().isForbidden());
        send(dio(), "/api/press/releases/" + id + "/issue", Map.of()).andExpect(status().isForbidden());
        // drafts are not shown to roles that only see releases through the AI module
        read(dd(), "/api/press/releases").forEach(r -> assertThat(r.get("status").asText()).isNotEqualTo("Draft"));
        mvc.perform(get("/api/press/releases/" + id).header("Authorization", dd())).andExpect(status().isForbidden());
        mvc.perform(get("/api/press/releases").header("Authorization", dio())).andExpect(status().isForbidden());
        // validation
        Map<String, Object> bad = draft("Atlantis");
        send(jd(), "/api/press/releases", bad).andExpect(status().isBadRequest());
        Map<String, Object> noBody = draft("State");
        noBody.put("body", " ");
        send(jd(), "/api/press/releases", noBody).andExpect(status().isBadRequest());
        Map<String, Object> lang = draft("State");
        lang.put("language", "Hindi");
        send(jd(), "/api/press/releases", lang).andExpect(status().isBadRequest());
        // drafts can be discarded
        ok(send(jd(), "/api/press/releases/" + id + "/discard", Map.of()));
        mvc.perform(get("/api/press/releases/" + id).header("Authorization", jd())).andExpect(status().isNotFound());
    }

    @Test
    void mediaKitDownloadCountsAndCarriesTheText() throws Exception {
        JsonNode p = ok(send(jd(), "/api/press/releases/" + ok(send(jd(), "/api/press/releases", draft("State"))).get("id").asText() + "/issue", Map.of()));
        String id = p.get("id").asText();
        byte[] zip = mvc.perform(get("/api/press/releases/" + id + "/kit").header("Authorization", jd())).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        Map<String, String> files = new HashMap<>();
        try (ZipInputStream z = new ZipInputStream(new ByteArrayInputStream(zip))) {
            for (ZipEntry e; (e = z.getNextEntry()) != null; ) files.put(e.getName(), new String(z.readAllBytes(), StandardCharsets.UTF_8));
        }
        assertThat(files).containsKeys("release.txt", "factsheet.txt");
        assertThat(files.get("release.txt")).contains("Body text of the release.").contains(id);
        assertThat(files.get("factsheet.txt")).contains("Department: Revenue").contains("Approved by: Joint Director (News)");
        assertThat(read(jd(), "/api/press/releases/" + id).get("kits").asInt()).isEqualTo(1);
        // seeded release: counter goes up from the seed value
        int before = read(dd(), "/api/press/releases/REL-1874").get("kits").asInt();
        mvc.perform(get("/api/press/releases/REL-1874/kit").header("Authorization", dd())).andExpect(status().isOk());
        assertThat(read(commr(), "/api/press/releases/REL-1874").get("kits").asInt()).isEqualTo(before + 1);
        // no kit for a draft
        String draftId = ok(send(jd(), "/api/press/releases", draft("State"))).get("id").asText();
        mvc.perform(get("/api/press/releases/" + draftId + "/kit").header("Authorization", jd())).andExpect(status().isBadRequest());
    }

    @Test
    void pickupAddsOutletsForPressRolesOnly() throws Exception {
        int before = read(jd(), "/api/press/releases/REL-1871").get("pickup").asInt();
        JsonNode r = ok(send(jd(), "/api/press/releases/REL-1871/pickup", Map.of("outlets", 5)));
        assertThat(r.get("pickup").asInt()).isEqualTo(before + 5);
        send(dd(), "/api/press/releases/REL-1871/pickup", Map.of("outlets", 5)).andExpect(status().isForbidden());
        send(dio(), "/api/press/releases/REL-1871/pickup", Map.of("outlets", 5)).andExpect(status().isForbidden());
        send(jd(), "/api/press/releases/REL-1871/pickup", Map.of("outlets", 0)).andExpect(status().isBadRequest());
        send(jd(), "/api/press/releases/REL-0000/pickup", Map.of("outlets", 2)).andExpect(status().isNotFound());
        assertThat(read(commr(), "/api/press/releases/REL-1871").get("pickup").asInt()).isEqualTo(before + 5);
    }
}
