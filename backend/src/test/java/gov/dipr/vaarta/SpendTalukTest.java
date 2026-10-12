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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Issuing a release order for one taluk of a district (optional; checked against the district). */
@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:vaarta-spend-taluk-test;DB_CLOSE_DELAY=-1", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class SpendTalukTest {
    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired ObjectMapper json;

    private String dio() { return "Bearer " + jwt.issue("dio.raichur", Role.DIO); }
    private String dd() { return "Bearer " + jwt.issue("dd.accounts", Role.DD_ACCOUNTS); }

    private Map<String, Object> order(String district, String vendor, String channel, String taluk) {
        Map<String, Object> m = new HashMap<>();
        m.put("campaignId", "CMP-T" + (int) (Math.random() * 1e6)); m.put("campaign", "Taluk test"); m.put("ctype", "Civic awareness");
        m.put("department", "Health & Family Welfare"); m.put("channel", channel); m.put("vendorId", vendor); m.put("district", district);
        m.put("month", "2026-09"); m.put("amount", 2.5);
        if (taluk != null) m.put("taluk", taluk);
        return m;
    }

    private ResultActions send(String auth, Object body) throws Exception {
        return mvc.perform(post("/api/spend/orders").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    @Test
    void anOrderCanNameATalukOfItsDistrict() throws Exception {
        JsonNode o = json.readTree(send(dio(), order("Raichur", "RF-C03", "Radio & FM", "manvi")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(o.get("taluk").asText()).isEqualTo("Manvi");
        JsonNode w = json.readTree(send(dio(), order("Raichur", "RF-C03", "Radio & FM", null)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(w.get("taluk").isNull()).isTrue();
        // a taluk of another district, or a taluk on a statewide order, is refused
        send(dio(), order("Raichur", "RF-C03", "Radio & FM", "Hubballi")).andExpect(status().isBadRequest());
        send(dd(), order("Statewide", "PR-K02", "Print", "Manvi")).andExpect(status().isBadRequest());
    }
}
