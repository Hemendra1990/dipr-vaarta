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
import java.util.stream.StreamSupport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** AI agents: who may run and approve each agent, and the side effect each approval persists. */
@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:vaarta-agents;DB_CLOSE_DELAY=-1", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class AgentsTest {
    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired ObjectMapper json;

    private String token(String user, Role role) { return "Bearer " + jwt.issue(user, role); }
    private String commr() { return token("commr.dipr", Role.COMMISSIONER); }
    private String jd() { return token("jd.news", Role.JD_NEWS); }
    private String dd() { return token("dd.accounts", Role.DD_ACCOUNTS); }

    private JsonNode read(String auth, String path) throws Exception {
        return json.readTree(mvc.perform(get(path).header("Authorization", auth)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private ResultActions send(String auth, String path, Object body) throws Exception {
        return mvc.perform(post(path).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    private JsonNode run(String auth, String agent, Map<String, Object> body) throws Exception {
        return json.readTree(send(auth, "/api/agents/" + agent + "/runs", body).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode approve(String auth, JsonNode run) throws Exception {
        return json.readTree(send(auth, "/api/agents/runs/" + run.get("id").asText() + "/approve", Map.of()).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    @Test
    void agentCardsFollowTheModulesOfTheRole() throws Exception {
        JsonNode dd = read(dd(), "/api/agents");
        assertThat(dd.size()).isEqualTo(7);
        Map<String, Boolean> runnable = new java.util.HashMap<>();
        dd.forEach(a -> runnable.put(a.get("id").asText(), a.get("canRun").asBoolean()));
        assertThat(runnable).containsEntry("spend", true).containsEntry("adaudit", true)
                .containsEntry("triage", false).containsEntry("press", false).containsEntry("planner", false);
        // the accounts wing cannot move tipline claims or issue a release through an agent
        send(dd(), "/api/agents/triage/runs", Map.of()).andExpect(status().isForbidden());
        send(dd(), "/api/agents/press/runs", Map.of()).andExpect(status().isForbidden());
        JsonNode jdTriage = run(jd(), "triage", Map.of());
        send(dd(), "/api/agents/runs/" + jdTriage.get("id").asText() + "/approve", Map.of()).andExpect(status().isForbidden());
        // the Joint Director cannot run the spend agents
        send(jd(), "/api/agents/spend/runs", Map.of()).andExpect(status().isForbidden());
        // run history only shows agents the user may run
        read(dd(), "/api/agents/runs").forEach(r -> assertThat(r.get("agentId").asText()).isIn("spend", "adaudit"));
        send(jd(), "/api/agents/runs/" + jdTriage.get("id").asText() + "/reject", Map.of("comment", "later")).andExpect(status().isOk());
    }

    @Test
    void triageMovesNewClaimsAndRecordsTheEffect() throws Exception {
        long before = StreamSupport.stream(read(jd(), "/api/tipline/claims").spliterator(), false).filter(c -> c.get("status").asText().equals("New")).count();
        assertThat(before).isPositive();
        JsonNode r = run(jd(), "triage", Map.of());
        assertThat(r.get("steps").get(0).asText()).contains(before + " new claims");
        JsonNode done = approve(jd(), r);
        assertThat(done.get("status").asText()).isEqualTo("Approved");
        assertThat(done.get("effect").asText()).startsWith(before + " claims moved to Triaged");
        assertThat(StreamSupport.stream(read(jd(), "/api/tipline/claims").spliterator(), false).noneMatch(c -> c.get("status").asText().equals("New"))).isTrue();
        // a decided run cannot be decided again
        send(jd(), "/api/agents/runs/" + r.get("id").asText() + "/approve", Map.of()).andExpect(status().isBadRequest());
    }

    @Test
    void plannerAddsTheTestToTheCampaignsRegister() throws Exception {
        int before = read(commr(), "/api/registers/campaigns/rows").size();
        JsonNode r = run(commr(), "planner", Map.of("target", "Manvi", "context", Map.of("areaLabel", "Raichur", "targetDistrict", "Raichur",
                "targetReadR", 0.5, "targetUptake", 60, "targetSubs", 12000)));
        assertThat(r.get("output").asText()).contains("Recovery plan · Manvi").contains("50.0%");
        JsonNode done = approve(commr(), r);
        assertThat(done.get("toast").get("title").asText()).isEqualTo("Campaign scheduled");
        JsonNode rows = read(commr(), "/api/registers/campaigns/rows");
        assertThat(rows.size()).isEqualTo(before + 1);
        JsonNode added = StreamSupport.stream(rows.spliterator(), false).filter(x -> x.get("campaign").asText().equals("Read-rate recovery test · Manvi"))
                .findFirst().orElseThrow();
        assertThat(added.get("district").asText()).isEqualTo("Raichur");
        assertThat(added.get("stage").asText()).isEqualTo("Creative in design");
        assertThat(done.get("effect").asText()).contains(added.get("campaignId").asText());
    }

    @Test
    void reportsForTheCommissionerReachTheInboxAndSendBackNeedsAComment() throws Exception {
        JsonNode f = run(dd(), "spend", Map.of());
        approve(dd(), f);
        JsonNode inbox = read(commr(), "/api/agents/inbox");
        assertThat(StreamSupport.stream(inbox.spliterator(), false).anyMatch(x -> x.get("id").asLong() == f.get("id").asLong())).isTrue();
        mvc.perform(get("/api/agents/inbox").header("Authorization", dd())).andExpect(status().isForbidden());

        JsonNode a = run(dd(), "adaudit", Map.of());
        send(dd(), "/api/agents/runs/" + a.get("id").asText() + "/reject", Map.of("comment", " ")).andExpect(status().isBadRequest());
        JsonNode back = json.readTree(send(dd(), "/api/agents/runs/" + a.get("id").asText() + "/reject", Map.of("comment", "Add the Bidar proofs"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(back.get("status").asText()).isEqualTo("Sent back");
        assertThat(back.get("comment").asText()).isEqualTo("Add the Bidar proofs");
        // running again sets aside an undecided earlier run
        JsonNode m1 = run(jd(), "monitor", Map.of());
        run(jd(), "monitor", Map.of());
        JsonNode hist = read(jd(), "/api/agents/runs");
        assertThat(StreamSupport.stream(hist.spliterator(), false).filter(x -> x.get("id").asLong() == m1.get("id").asLong())
                .findFirst().orElseThrow().get("status").asText()).isEqualTo("Superseded");
    }

    @Test
    void pressAgentApprovalIsForPressApproversOnly() throws Exception {
        JsonNode r = run(commr(), "press", Map.of());
        JsonNode done = approve(commr(), r);
        assertThat(done.get("effect").asText()).contains("issued");
        assertThat(done.get("sentTo").asText()).contains("Raichur");
    }
}
