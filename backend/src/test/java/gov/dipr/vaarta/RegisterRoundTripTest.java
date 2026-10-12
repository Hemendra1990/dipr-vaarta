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

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Every seeded record of every register can be saved back from the edit form unchanged (all field types round-trip). */
@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:vaarta-roundtrip-test;DB_CLOSE_DELAY=-1", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class RegisterRoundTripTest {
    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired ObjectMapper json;

    static final List<String> REGS = List.of("campaigns", "empanel", "bills", "media", "social", "crisis", "welfare", "events", "election",
            "field", "outdoor", "film", "publications", "archive", "grants", "admin", "rti");

    @Test
    void everyRecordSavesBackUnchangedFromTheForm() throws Exception {
        String auth = "Bearer " + jwt.issue("commr.dipr", Role.COMMISSIONER);
        JsonNode meta = json.readTree(mvc.perform(get("/api/meta").header("Authorization", auth)).andReturn().getResponse().getContentAsString());
        Map<String, JsonNode> defs = new LinkedHashMap<>();
        for (JsonNode d : meta.get("registers")) defs.put(d.get("id").asText(), d);
        List<String> problems = new ArrayList<>();
        for (String reg : REGS) {
            JsonNode def = defs.get(reg);
            JsonNode rows = json.readTree(mvc.perform(get("/api/registers/" + reg + "/rows").header("Authorization", auth))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
            int step = Math.max(1, rows.size() / 25);
            for (int i = 0; i < rows.size(); i += step) {
                JsonNode row = rows.get(i);
                // what the form sends: every schema field as a string, "" when empty
                Map<String, Object> form = new LinkedHashMap<>();
                for (JsonNode f : def.get("schema")) {
                    JsonNode v = row.get(f.get("k").asText());
                    form.put(f.get("k").asText(), v == null || v.isNull() ? "" : v.asText());
                }
                var res = mvc.perform(put("/api/registers/" + reg + "/rows/" + row.get("_id").asLong()).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(form))).andReturn().getResponse();
                if (res.getStatus() != 200) { problems.add(reg + " " + row + " -> " + res.getContentAsString()); continue; }
                JsonNode saved = json.readTree(res.getContentAsString());
                if (!saved.equals(row)) problems.add(reg + " changed: " + row + " -> " + saved);
            }
        }
        assertThat(problems).isEmpty();
    }
}
