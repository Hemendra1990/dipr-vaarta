package gov.dipr.vaarta;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import gov.dipr.vaarta.repo.AuditEventRepo;
import gov.dipr.vaarta.security.JwtService;
import gov.dipr.vaarta.security.Role;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.io.ByteArrayInputStream;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Add, edit, stage moves, delete and export of the generic registers, with validation and scope rules. */
@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:vaarta-registers-test;DB_CLOSE_DELAY=-1", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class RegistersTest {
    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired ObjectMapper json;
    @Autowired AuditEventRepo audit;

    private String token(String user, Role role) { return "Bearer " + jwt.issue(user, role); }
    private String commr() { return token("commr.dipr", Role.COMMISSIONER); }
    private String jd() { return token("jd.news", Role.JD_NEWS); }
    private String dd() { return token("dd.accounts", Role.DD_ACCOUNTS); }
    private String dio() { return token("dio.raichur", Role.DIO); }
    private String nodal() { return token("nodal.health", Role.DEPT_NODAL); }
    private String vendor() { return token("vendor.prk02", Role.VENDOR); }

    private JsonNode body(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    private ResultActions send(String method, String auth, String path, Object b) throws Exception {
        var req = switch (method) {
            case "PUT" -> put(path);
            case "DELETE" -> delete(path);
            default -> post(path);
        };
        return mvc.perform(req.header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(b == null ? Map.of() : b)));
    }

    private static Map<String, Object> rti(String id, String district) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rtiId", id); m.put("received", "05-10-2026"); m.put("wing", "News"); m.put("applicant", "Citizen");
        m.put("district", district); m.put("stage", "Received");
        return m;
    }

    @Test
    void createEditAdvanceAndDeleteAnRtiRecord() throws Exception {
        long auditBefore = audit.count();
        JsonNode c = body(send("POST", dio(), "/api/registers/rti/rows", rti("RTI-X-1", "Raichur")).andExpect(status().isOk()));
        assertThat(c.get("_id").asLong()).isPositive();
        assertThat(c.get("received").asText()).isEqualTo("2026-10-05");
        long id = c.get("_id").asLong();

        Map<String, Object> edit = rti("RTI-X-1", "Raichur");
        edit.put("applicant", "Media");
        JsonNode e = body(send("PUT", dio(), "/api/registers/rti/rows/" + id, edit).andExpect(status().isOk()));
        assertThat(e.get("applicant").asText()).isEqualTo("Media");
        assertThat(e.get("_id").asLong()).isEqualTo(id);

        JsonNode a = body(send("POST", dio(), "/api/registers/rti/rows/" + id + "/advance", null).andExpect(status().isOk()));
        assertThat(a.get("stage").asText()).isEqualTo("Information sought");
        JsonNode named = body(send("POST", dio(), "/api/registers/rti/rows/" + id + "/advance", Map.of("stage", "Closed")).andExpect(status().isOk()));
        assertThat(named.get("stage").asText()).isEqualTo("Closed");
        send("POST", dio(), "/api/registers/rti/rows/" + id + "/advance", null).andExpect(status().isBadRequest());
        send("POST", dio(), "/api/registers/rti/rows/" + id + "/advance", Map.of("stage", "Nowhere")).andExpect(status().isBadRequest());

        // only the Commissioner deletes
        send("DELETE", dio(), "/api/registers/rti/rows/" + id, null).andExpect(status().isForbidden());
        send("DELETE", dd(), "/api/registers/rti/rows/" + id, null).andExpect(status().isForbidden());
        send("DELETE", commr(), "/api/registers/rti/rows/" + id, null).andExpect(status().isOk());
        send("PUT", commr(), "/api/registers/rti/rows/" + id, edit).andExpect(status().isNotFound());
        assertThat(audit.count()).isGreaterThanOrEqualTo(auditBefore + 5);
    }

    @Test
    void everyFieldIsValidatedWithTheUploadRules() throws Exception {
        Map<String, Object> bad = rti("", "Atlantis");
        bad.put("received", "31-31-2026");
        bad.put("wing", "Nowhere");
        JsonNode r = body(send("POST", commr(), "/api/registers/rti/rows", bad).andExpect(status().isBadRequest()));
        JsonNode errs = r.get("errors");
        assertThat(errs.has("rtiId")).isTrue();
        assertThat(errs.has("received")).isTrue();
        assertThat(errs.has("wing")).isTrue();
        assertThat(errs.get("district").asText()).isEqualTo("Unknown district name");
        // the ID field is unique within the register
        send("POST", commr(), "/api/registers/rti/rows", rti("RTI-U-1", "Mysuru")).andExpect(status().isOk());
        JsonNode dup = body(send("POST", commr(), "/api/registers/rti/rows", rti("RTI-U-1", "Mysuru")).andExpect(status().isBadRequest()));
        assertThat(dup.get("errors").has("rtiId")).isTrue();
        // Statewide only where the field allows it (crisis advisories are always for a district)
        Map<String, Object> adv = new LinkedHashMap<>(Map.of("advisoryId", "ADV-T1", "date", "2026-10-01", "hazard", "Flood", "district", "Statewide",
                "languages", 3, "minutes", 40, "reached", 1000, "readRate", 70, "stage", "Active"));
        assertThat(body(send("POST", commr(), "/api/registers/crisis/rows", adv).andExpect(status().isBadRequest())).get("errors").has("district")).isTrue();
    }

    @Test
    void writesStayInsideTheUsersScope() throws Exception {
        // district officer: not another district, not Statewide, not another district's record
        send("POST", dio(), "/api/registers/rti/rows", rti("RTI-S-1", "Mysuru")).andExpect(status().isBadRequest());
        send("POST", dio(), "/api/registers/rti/rows", rti("RTI-S-2", "Statewide")).andExpect(status().isBadRequest());
        long mysuru = body(send("POST", commr(), "/api/registers/rti/rows", rti("RTI-S-3", "Mysuru")).andExpect(status().isOk())).get("_id").asLong();
        send("PUT", dio(), "/api/registers/rti/rows/" + mysuru, rti("RTI-S-3", "Raichur")).andExpect(status().isForbidden());
        send("POST", dio(), "/api/registers/rti/rows/" + mysuru + "/advance", null).andExpect(status().isForbidden());
        // geo-all register: a district officer sees statewide campaigns but cannot change them
        JsonNode camps = body(mvc.perform(get("/api/registers/campaigns/rows").header("Authorization", dio())).andExpect(status().isOk()));
        long statewide = -1;
        for (JsonNode c : camps) if ("Statewide".equals(c.get("district").asText())) { statewide = c.get("_id").asLong(); break; }
        assertThat(statewide).isPositive();
        send("POST", dio(), "/api/registers/campaigns/rows/" + statewide + "/advance", null).andExpect(status().isForbidden());

        // vendor: read-only
        send("POST", vendor(), "/api/registers/bills/rows", Map.of()).andExpect(status().isForbidden());
        long bill = body(mvc.perform(get("/api/registers/bills/rows").header("Authorization", vendor())).andExpect(status().isOk())).get(0).get("_id").asLong();
        send("POST", vendor(), "/api/registers/bills/rows/" + bill + "/advance", null).andExpect(status().isForbidden());

        // nodal officer: only their department's rows
        JsonNode all = body(mvc.perform(get("/api/registers/campaigns/rows").header("Authorization", commr())).andExpect(status().isOk()));
        JsonNode other = null, own = null;
        for (JsonNode c : all) {
            if (other == null && !"Health & Family Welfare".equals(c.get("department").asText())) other = c;
            if (own == null && "Health & Family Welfare".equals(c.get("department").asText()) && !"Evaluated".equals(c.get("stage").asText())) own = c;
        }
        assertThat(other).isNotNull();
        assertThat(own).isNotNull();
        send("POST", nodal(), "/api/registers/campaigns/rows/" + other.get("_id").asLong() + "/advance", null).andExpect(status().isForbidden());
        send("POST", nodal(), "/api/registers/campaigns/rows/" + own.get("_id").asLong() + "/advance", null).andExpect(status().isOk());
        Map<String, Object> moved = json.convertValue(own, Map.class);
        moved.put("department", "Energy");
        assertThat(body(send("PUT", nodal(), "/api/registers/campaigns/rows/" + own.get("_id").asLong(), moved).andExpect(status().isBadRequest()))
                .get("errors").has("department")).isTrue();

        // a module the user cannot open
        send("POST", jd(), "/api/registers/rti/rows", rti("RTI-S-4", "Mysuru")).andExpect(status().isForbidden());
    }

    @Test
    void exportGivesTheVisibleRowsWithTemplateHeadings() throws Exception {
        byte[] x = mvc.perform(get("/api/registers/rti/export").header("Authorization", dio())).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        int visible = body(mvc.perform(get("/api/registers/rti/rows").header("Authorization", dio()))).size();
        try (XSSFWorkbook wb = new XSSFWorkbook(new ByteArrayInputStream(x))) {
            var sheet = wb.getSheet("Data");
            assertThat(sheet.getRow(0).getCell(0).getStringCellValue()).isEqualTo("RTI ID");
            assertThat(sheet.getLastRowNum()).isEqualTo(visible);
            for (int i = 1; i <= sheet.getLastRowNum(); i++) assertThat(sheet.getRow(i).getCell(4).getStringCellValue()).isEqualTo("Raichur");
        }
        mvc.perform(get("/api/registers/rti/export").header("Authorization", jd())).andExpect(status().isForbidden());
    }
}
