package gov.dipr.vaarta;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import gov.dipr.vaarta.security.JwtService;
import gov.dipr.vaarta.security.Role;
import gov.dipr.vaarta.service.BotService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The WhatsApp bot webhook, live updates and the claim detail / edit workflow. */
@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:vaarta-bot-test;DB_CLOSE_DELAY=-1", "spring.jpa.hibernate.ddl-auto=create-drop",
        "vaarta.bot-key=test-bot-key"})
@AutoConfigureMockMvc
class BotAndTiplineTest {
    static final String KEY = "test-bot-key";
    static final String RAICHUR_DIO = "+91 90000 10027"; // registered demo number (see BotContactSeeder)
    static final String CITIZEN = "+91 98450 12345";

    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired ObjectMapper json;

    private String token(String user, Role role) { return "Bearer " + jwt.issue(user, role); }
    private String commr() { return token("commr.dipr", Role.COMMISSIONER); }
    private String jd() { return token("jd.news", Role.JD_NEWS); }
    private String dio() { return token("dio.raichur", Role.DIO); }
    private String dd() { return token("dd.accounts", Role.DD_ACCOUNTS); }

    private JsonNode body(ResultActions r) throws Exception { return json.readTree(r.andReturn().getResponse().getContentAsString()); }

    private JsonNode read(String auth, String path) throws Exception {
        return body(mvc.perform(get(path).header("Authorization", auth)).andExpect(status().isOk()));
    }

    private ResultActions send(String auth, String path, Object b) throws Exception {
        return mvc.perform(post(path).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(b)));
    }

    private ResultActions bot(String key, Map<String, Object> msg) throws Exception {
        var req = post("/api/bot/inbound").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(msg));
        if (key != null) req.header("X-Vaarta-Bot-Key", key);
        return mvc.perform(req);
    }

    private static Map<String, Object> msg(Object... kv) {
        Map<String, Object> m = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    @Test
    void theWebhookNeedsTheBotKey() throws Exception {
        Map<String, Object> m = msg("from", CITIZEN, "text", "Some rumour", "district", "Mysuru");
        bot(null, m).andExpect(status().isUnauthorized());
        bot("wrong-key", m).andExpect(status().isForbidden());
        // a console token is not a bot key
        mvc.perform(post("/api/bot/inbound").header("Authorization", commr()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(m)))
                .andExpect(status().isUnauthorized());
        bot(KEY, msg("from", CITIZEN, "text", "  ")).andExpect(status().isBadRequest());
    }

    @Test
    void aTiplineMessageBecomesANewClaimWithAGuessedType() throws Exception {
        JsonNode r = body(bot(KEY, msg("from", CITIZEN, "text", "Recruitment notice: 900 bill collector posts, pay ₹300 exam fee by UPI today",
                "district", "mysuru", "forwards", 75)).andExpect(status().isOk()));
        assertThat(r.get("accepted").asBoolean()).isTrue();
        assertThat(r.get("status").asText()).isEqualTo("New");
        assertThat(r.get("reply").asText()).contains(r.get("id").asText());
        JsonNode d = read(jd(), "/api/tipline/claims/" + r.get("id").asText());
        assertThat(d.at("/claim/category").asText()).isEqualTo("Fake recruitment");
        assertThat(d.at("/claim/district").asText()).isEqualTo("Mysuru");
        assertThat(d.at("/claim/forwards").asInt()).isEqualTo(75);
        assertThat(d.at("/claim/source").asText()).isEqualTo("Tipline");
        assertThat(d.at("/claim/contact").asText()).doesNotContain("12345");
        assertThat(d.get("history").size()).isEqualTo(1);
        assertThat(d.at("/history/0/who").asText()).isEqualTo("WhatsApp bot");
        // Kannada script is detected
        JsonNode kn = body(bot(KEY, msg("from", CITIZEN, "text", "ಅಣೆಕಟ್ಟು ಒಡೆದಿದೆ dam gates opened evacuate now", "district", "Mandya")).andExpect(status().isOk()));
        JsonNode kd = read(commr(), "/api/tipline/claims/" + kn.get("id").asText());
        assertThat(kd.at("/claim/lang").asText()).isEqualTo("Kannada");
        assertThat(kd.at("/claim/category").asText()).isEqualTo("Public safety");
        // without a district the bot asks for one and nothing is stored
        JsonNode ask = body(bot(KEY, msg("from", CITIZEN, "text", "Free laptops for all students")).andExpect(status().isOk()));
        assertThat(ask.get("accepted").asBoolean()).isFalse();
        assertThat(ask.get("reply").asText()).contains("district");
    }

    @Test
    void aForwardOfAPublishedClaimIsAnsweredWithTheExistingVerdict() throws Exception {
        // IDTU-26-4471 is published as False in the sample data
        JsonNode r = body(bot(KEY, msg("from", CITIZEN, "text", "Fwd: Gruha Lakshmi will stop from November!! Re-apply on this link before Friday",
                "district", "Koppal")).andExpect(status().isOk()));
        assertThat(r.get("status").asText()).isEqualTo("Published");
        assertThat(r.get("reply").asText()).contains("IDTU-26-4471").contains("False");
        JsonNode d = read(jd(), "/api/tipline/claims/" + r.get("id").asText());
        assertThat(d.at("/claim/matchOf").asText()).isEqualTo("IDTU-26-4471");
        assertThat(d.at("/related/0/id").asText()).isEqualTo("IDTU-26-4471");
        assertThat(d.get("canEdit").asBoolean()).isFalse();
        // an unrelated message is not matched
        JsonNode other = body(bot(KEY, msg("from", CITIZEN, "text", "New metro line opening in Hubballi next week with free rides", "district", "Dharwad")));
        assertThat(other.get("status").asText()).isEqualTo("New");
    }

    @Test
    void feedMessagesComeOnlyFromRegisteredDistrictOfficesAndStayInTheirDistrict() throws Exception {
        // the district in the message is ignored: a Raichur number always posts to Raichur
        JsonNode r = body(bot(KEY, msg("from", RAICHUR_DIO, "type", "pulse", "text", "Ration card holders in Lingsugur ask about the new rice quota",
                "district", "Mysuru", "scheme", "Anna Bhagya", "sentiment", "mixed")).andExpect(status().isOk()));
        assertThat(r.get("kind").asText()).isEqualTo("feed");
        assertThat(r.get("reply").asText()).contains("Raichur");
        JsonNode esc = body(bot(KEY, msg("from", RAICHUR_DIO, "text", "ESC: GRV-RCR-2299 pension not credited for 3 months (Devadurga)")).andExpect(status().isOk()));
        assertThat(esc.get("reply").asText()).startsWith("Citizen escalation");
        JsonNode feed = read(dio(), "/api/offices/feed");
        JsonNode first = feed.get(0);
        assertThat(first.get("district").asText()).isEqualTo("Raichur");
        assertThat(first.get("type").asText()).isEqualTo("esc");
        assertThat(first.get("channel").asText()).isEqualTo("WhatsApp");
        assertThat(feed.get(1).get("sentiment").asText()).isEqualTo("Mixed");
        // an unregistered number cannot post to the ground feed
        int before = read(commr(), "/api/offices/feed").size();
        JsonNode no = body(bot(KEY, msg("from", CITIZEN, "type", "report", "text", "Daily report: all fine")).andExpect(status().isOk()));
        assertThat(no.get("accepted").asBoolean()).isFalse();
        assertThat(read(commr(), "/api/offices/feed").size()).isEqualTo(before);
        // a DIO's tipline forward is filed under their district as a district-office claim
        JsonNode cl = body(bot(KEY, msg("from", RAICHUR_DIO, "type", "claim", "text", "Viral video shows a minister promising free gold")));
        JsonNode cd = read(dio(), "/api/tipline/claims/" + cl.get("id").asText());
        assertThat(cd.at("/claim/district").asText()).isEqualTo("Raichur");
        assertThat(cd.at("/claim/source").asText()).isEqualTo("District office");
        assertThat(cd.at("/claim/category").asText()).isEqualTo("Synthetic media");
    }

    @Test
    void updatesAreScopedToTheUser() throws Exception {
        JsonNode start = read(dio(), "/api/updates");
        assertThat(start.get("claims").size()).isZero();
        String since = Instant.parse(start.get("now").asText()).minusMillis(1).toString();
        bot(KEY, msg("from", CITIZEN, "text", "Bus fare hike of 40 percent from Monday across KSRTC", "district", "Raichur")).andExpect(status().isOk());
        bot(KEY, msg("from", CITIZEN, "text", "Milk price to rise by 10 rupees from tomorrow says notice", "district", "Udupi")).andExpect(status().isOk());
        bot(KEY, msg("from", RAICHUR_DIO, "type", "report", "text", "Daily report: 2 events covered")).andExpect(status().isOk());

        JsonNode d = read(dio(), "/api/updates?since=" + since);
        assertThat(d.get("claims").size()).isEqualTo(1);
        assertThat(d.at("/claims/0/district").asText()).isEqualTo("Raichur");
        assertThat(d.get("feed").size()).isEqualTo(1);

        JsonNode c = read(commr(), "/api/updates?since=" + since);
        assertThat(c.get("claims").size()).isEqualTo(2);
        assertThat(c.get("feed").size()).isEqualTo(1);

        JsonNode j = read(jd(), "/api/updates?since=" + since); // tipline but no district offices
        assertThat(j.get("claims").size()).isEqualTo(2);
        assertThat(j.get("feed").size()).isZero();

        JsonNode a = read(dd(), "/api/updates?since=" + since); // neither module
        assertThat(a.get("claims").size()).isZero();
        assertThat(a.get("feed").size()).isZero();

        // your own console posts do not come back as updates
        send(dio(), "/api/offices/feed", Map.of("type", "pulse", "note", "Posted from the console")).andExpect(status().isOk());
        assertThat(read(dio(), "/api/updates?since=" + since).get("feed").size()).isEqualTo(1);
        assertThat(read(commr(), "/api/updates?since=" + since).get("feed").size()).isEqualTo(2);

        mvc.perform(get("/api/updates?since=yesterday").header("Authorization", dio())).andExpect(status().isBadRequest());
        mvc.perform(get("/api/updates")).andExpect(status().isUnauthorized());
    }

    @Test
    void verdictAndTypeCanBeEditedBeforePublishingOnly() throws Exception {
        JsonNode r = body(bot(KEY, msg("from", CITIZEN, "text", "Circular says all colleges closed for a week", "district", "Raichur")));
        String id = r.get("id").asText();
        JsonNode e = body(send(dio(), "/api/tipline/claims/" + id + "/edit", Map.of("verdict", "Misleading", "category", "Doctored circular",
                "clarification", "No such circular was issued. Colleges are open.")).andExpect(status().isOk()));
        assertThat(e.get("verdict").asText()).isEqualTo("Misleading");
        send(dio(), "/api/tipline/claims/" + id + "/edit", Map.of("category", "Not a type")).andExpect(status().isBadRequest());
        send(dio(), "/api/tipline/claims/IDTU-26-4490/edit", Map.of("verdict", "False")).andExpect(status().isForbidden());
        send(dio(), "/api/tipline/claims/" + id + "/transition", Map.of("to", "Triaged")).andExpect(status().isOk());
        send(dio(), "/api/tipline/claims/" + id + "/transition", Map.of("to", "Draft ready")).andExpect(status().isOk());
        send(dio(), "/api/tipline/claims/" + id + "/transition", Map.of("to", "Published")).andExpect(status().isForbidden());
        JsonNode pub = body(send(commr(), "/api/tipline/claims/" + id + "/transition", Map.of("to", "Published")).andExpect(status().isOk()));
        assertThat(pub.get("verdict").asText()).isEqualTo("Misleading");
        send(commr(), "/api/tipline/claims/" + id + "/edit", Map.of("verdict", "False")).andExpect(status().isBadRequest());
        JsonNode d = read(dio(), "/api/tipline/claims/" + id);
        assertThat(d.get("history").size()).isEqualTo(5); // create, edit, Triaged, Draft ready, Published
        assertThat(d.get("canPublish").asBoolean()).isFalse();
        // a later forward of it gets the edited clarification
        JsonNode again = body(bot(KEY, msg("from", CITIZEN, "text", "circular: all colleges closed for a week!!", "district", "Bidar")));
        assertThat(again.get("reply").asText()).contains(id).contains("Colleges are open");
    }

    @Test
    void categoryRules() {
        assertThat(BotService.guessCategory("Deepfake video of the CM")).isEqualTo("Synthetic media");
        assertThat(BotService.guessCategory("Petrol price to drop by 20")).isEqualTo("Price rumour");
        assertThat(BotService.guessCategory("Shakti scheme ends next month")).isEqualTo("Scheme rumour");
        assertThat(BotService.normalisePhone("09000010027")).isEqualTo("919000010027");
        assertThat(BotService.mask("919000010027")).isEqualTo("+91 90000 xxx27");
    }
}
