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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/**
 * The full role × module matrix, checked against the server for every demo login: what each role may read, and the key
 * writes it must be refused. The expected module lists are written out from the prototype's PROLES (plus the
 * Commissioner-only administration modules) rather than read from {@link Role}, so a change to Role.java fails here.
 */
@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:vaarta-rolematrix-test;DB_CLOSE_DELAY=-1", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class RoleMatrixTest {
    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired ObjectMapper json;

    static final List<String> ALL = List.of("overview", "ai", "tipline", "media", "social", "crisis", "spend", "campaigns", "empanel", "bills", "ads",
            "press", "welfare", "events", "election", "offices", "field", "outdoor", "film", "publications", "archive", "grants", "admin", "rti",
            "upload", "users", "audit");
    static final List<String> REGISTERS = List.of("campaigns", "empanel", "bills", "media", "social", "crisis", "welfare", "events", "election",
            "field", "outdoor", "film", "publications", "archive", "grants", "admin", "rti");
    static final Set<String> OUTREACH = Set.of("overview", "tipline", "press", "offices", "ai", "ads");

    /** Prototype PROLES tabs, in the prototype's order. */
    static final Map<Role, List<String>> EXPECTED = new LinkedHashMap<>();
    static final Map<Role, String> USER = new LinkedHashMap<>();
    static {
        EXPECTED.put(Role.COMMISSIONER, ALL);
        EXPECTED.put(Role.JD_NEWS, List.of("overview", "tipline", "media", "social", "crisis", "press", "welfare", "events", "election", "archive", "ai", "upload"));
        EXPECTED.put(Role.DD_ACCOUNTS, List.of("spend", "campaigns", "empanel", "bills", "ads", "outdoor", "field", "grants", "admin", "rti", "ai", "upload"));
        EXPECTED.put(Role.DIO, List.of("overview", "tipline", "offices", "field", "outdoor", "events", "media", "crisis", "welfare", "campaigns", "spend", "rti", "upload"));
        EXPECTED.put(Role.DEPT_NODAL, List.of("spend", "campaigns", "bills", "media"));
        EXPECTED.put(Role.VENDOR, List.of("spend", "bills", "empanel"));
        EXPECTED.put(Role.FILM_SECTION, List.of("film", "grants", "publications", "archive", "upload"));
        USER.put(Role.COMMISSIONER, "commr.dipr");
        USER.put(Role.JD_NEWS, "jd.news");
        USER.put(Role.DD_ACCOUNTS, "dd.accounts");
        USER.put(Role.DIO, "dio.raichur");
        USER.put(Role.DEPT_NODAL, "nodal.health");
        USER.put(Role.VENDOR, "vendor.prk02");
        USER.put(Role.FILM_SECTION, "film.section");
    }

    private String auth(Role r) { return "Bearer " + jwt.issue(USER.get(r), r); }

    private int status(MockHttpServletRequestBuilder req, Role r) throws Exception {
        if (r != null) req.header("Authorization", auth(r));
        return mvc.perform(req).andReturn().getResponse().getStatus();
    }

    private int send(String method, String path, Role r, Object body) throws Exception {
        MockHttpServletRequestBuilder b = switch (method) {
            case "PUT" -> put(path);
            case "DELETE" -> delete(path);
            default -> post(path);
        };
        b.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body == null ? Map.of() : body));
        return status(b, r);
    }

    private JsonNode read(String path, Role r) throws Exception {
        var res = mvc.perform(get(path).header("Authorization", auth(r))).andReturn().getResponse();
        assertThat(res.getStatus()).as(r + " GET " + path).isEqualTo(200);
        return json.readTree(res.getContentAsString());
    }

    private static boolean any(List<String> mods, String... keys) {
        for (String k : keys) if (mods.contains(k)) return true;
        return false;
    }

    @Test
    void roleModulesMatchThePrototype() {
        EXPECTED.forEach((r, mods) -> assertThat(r.modules).as(r.name()).containsExactlyElementsOf(mods));
        assertThat(Role.values()).hasSize(7);
    }

    @Test
    void meAndMetaReportOnlyTheRolesModules() throws Exception {
        for (Role r : EXPECTED.keySet()) {
            List<String> mods = EXPECTED.get(r);
            JsonNode me = read("/api/auth/me", r);
            List<String> got = new ArrayList<>();
            me.get("modules").forEach(m -> got.add(m.asText()));
            assertThat(got).as(r + " modules").containsExactlyElementsOf(mods);
            Set<String> regs = new TreeSet<>();
            read("/api/meta", r).get("registers").forEach(x -> regs.add(x.get("id").asText()));
            assertThat(regs).as(r + " registers in meta").isEqualTo(new TreeSet<>(REGISTERS.stream().filter(mods::contains).toList()));
        }
    }

    /** Every read endpoint, for every role: 200 when the role has the module, 403 otherwise. */
    @Test
    void readMatrix() throws Exception {
        List<String> wrong = new ArrayList<>();
        for (Role r : EXPECTED.keySet()) {
            List<String> m = EXPECTED.get(r);
            Map<String, Boolean> expect = new LinkedHashMap<>();
            for (String reg : REGISTERS) {
                expect.put("/api/registers/" + reg + "/rows", m.contains(reg));
                expect.put("/api/registers/" + reg + "/export", m.contains(reg));
            }
            for (String p : List.of("/api/spend/orders", "/api/spend/budget", "/api/spend/vendors")) expect.put(p, m.contains("spend"));
            expect.put("/api/tipline/claims", any(m, "tipline", "ai"));
            expect.put("/api/press/releases", any(m, "press", "ai"));
            expect.put("/api/ads/flags", any(m, "ads", "ai"));
            expect.put("/api/offices/feed", m.contains("offices"));
            expect.put("/api/outreach/base", m.stream().anyMatch(OUTREACH::contains));
            expect.put("/api/agents", m.contains("ai"));
            expect.put("/api/agents/runs", m.contains("ai"));
            for (String p : List.of("/api/users", "/api/users/options", "/api/bot/contacts")) expect.put(p, m.contains("users"));
            for (String p : List.of("/api/audit", "/api/audit/facets")) expect.put(p, m.contains("audit"));
            for (String p : List.of("/api/auth/me", "/api/meta", "/api/updates", "/api/uploads/datasets", "/api/uploads/history")) expect.put(p, true);
            for (var e : expect.entrySet()) {
                int s = status(get(e.getKey()), r);
                int want = e.getValue() ? 200 : 403;
                if (s != want) wrong.add(r + " GET " + e.getKey() + " → " + s + " (want " + want + ")");
            }
        }
        assertThat(wrong).isEmpty();
    }

    /** Uploads: only roles with the upload module, only datasets of modules they can open; vendors and DIOs' budget never. */
    @Test
    void uploadMatrix() throws Exception {
        List<String> datasets = new ArrayList<>(REGISTERS);
        datasets.add("spend");
        datasets.add("budget");
        List<String> wrong = new ArrayList<>();
        for (Role r : EXPECTED.keySet()) {
            List<String> m = EXPECTED.get(r);
            Set<String> got = new TreeSet<>();
            read("/api/uploads/datasets", r).forEach(d -> got.add(d.get("id").asText()));
            Set<String> want = new TreeSet<>();
            if (m.contains("upload"))
                for (String d : datasets) {
                    String module = d.equals("budget") ? "spend" : d;
                    if (m.contains(module) && !(d.equals("budget") && r == Role.DIO)) want.add(d);
                }
            if (!got.equals(want)) wrong.add(r + " datasets " + got + " (want " + want + ")");
            for (String d : datasets) {
                int s = status(get("/api/uploads/" + d + "/template"), r);
                int w = want.contains(d) ? 200 : 403;
                if (s != w) wrong.add(r + " template " + d + " → " + s + " (want " + w + ")");
            }
        }
        assertThat(wrong).isEmpty();
    }

    @Test
    void everyApiNeedsASignIn() throws Exception {
        for (String p : List.of("/api/auth/me", "/api/meta", "/api/outreach/base", "/api/tipline/claims", "/api/press/releases", "/api/ads/flags",
                "/api/offices/feed", "/api/spend/orders", "/api/spend/budget", "/api/registers/rti/rows", "/api/uploads/datasets", "/api/agents/runs",
                "/api/users", "/api/audit", "/api/bot/contacts", "/api/updates"))
            assertThat(status(get(p), null)).as(p).isEqualTo(401);
        assertThat(send("POST", "/api/tipline/claims", null, Map.of())).isEqualTo(401);
        assertThat(status(get("/api/meta").header("Authorization", "Bearer not-a-token"), null)).isEqualTo(401);
        // the sign-in screen itself is public
        assertThat(status(get("/api/auth/roles"), null)).isEqualTo(200);
        assertThat(status(post("/api/auth/captcha"), null)).isEqualTo(200);
    }

    /** Key writes each role must be refused (403), checked before any record is looked up or changed. */
    @Test
    void writeRefusals() throws Exception {
        Map<String, Object> claim = Map.of("text", "Forward about a scheme", "lang", "Kannada", "district", "Mysuru", "category", "Scheme");
        Map<String, Object> feed = Map.of("type", "pulse", "district", "Mysuru", "note", "Test");
        Map<String, Object> user = Map.of("username", "x.test", "displayName", "X", "role", "JD_NEWS", "password", "abcdefg1");
        Map<String, Object> contact = Map.of("phone", "+91 90000 19999", "district", "Mysuru");
        Map<String, Object> release = Map.of("title", "T", "dept", "Health & Family Welfare", "district", "State", "body", "B");
        List<String> wrong = new ArrayList<>();
        record W(Role r, String method, String path, Object body) {}
        List<W> refused = new ArrayList<>();
        for (Role r : EXPECTED.keySet()) {
            if (r == Role.COMMISSIONER) continue;
            refused.add(new W(r, "POST", "/api/users", user));
            refused.add(new W(r, "POST", "/api/users/1/active", Map.of("active", false)));
            refused.add(new W(r, "POST", "/api/users/1/reset-password", null));
            refused.add(new W(r, "POST", "/api/users/1/unlock", null));
            refused.add(new W(r, "POST", "/api/bot/contacts", contact));
            refused.add(new W(r, "DELETE", "/api/registers/rti/rows/1", null));
            refused.add(new W(r, "DELETE", "/api/registers/media/rows/1", null));
            if (!EXPECTED.get(r).contains("tipline")) refused.add(new W(r, "POST", "/api/tipline/claims", claim));
            if (!EXPECTED.get(r).contains("offices")) refused.add(new W(r, "POST", "/api/offices/feed", feed));
            if (!EXPECTED.get(r).contains("ads")) refused.add(new W(r, "POST", "/api/ads/flags/review", Map.of("ro", "RO/26/00001")));
            if (!EXPECTED.get(r).contains("press")) refused.add(new W(r, "POST", "/api/press/releases", release));
            if (r != Role.JD_NEWS) refused.add(new W(r, "POST", "/api/press/releases/D-1/issue", null));
            if (!EXPECTED.get(r).contains("ai")) refused.add(new W(r, "POST", "/api/agents/triage/runs", Map.of()));
            if (r != Role.DD_ACCOUNTS) {
                refused.add(new W(r, "POST", "/api/spend/orders/1/pay", Map.of("paidOn", "2026-10-01", "reference", "X")));
                refused.add(new W(r, "PUT", "/api/spend/budget", Map.of("fy", "2026-27", "department", "Health & Family Welfare", "channel", "Print", "budget", 1)));
            }
            if (r != Role.VENDOR) refused.add(new W(r, "POST", "/api/spend/orders/1/bill", Map.of("billNo", "B1", "amount", 1, "billDate", "2026-10-01")));
            if (r != Role.DD_ACCOUNTS && r != Role.DIO) refused.add(new W(r, "POST", "/api/spend/orders", Map.of("campaignId", "C1")));
        }
        refused.add(new W(Role.COMMISSIONER, "POST", "/api/spend/orders/1/bill", Map.of("billNo", "B1", "amount", 1, "billDate", "2026-10-01")));
        // district officer: own district only
        refused.add(new W(Role.DIO, "POST", "/api/tipline/claims", claim));
        refused.add(new W(Role.DIO, "POST", "/api/press/releases", release));
        // vendors read registers but never change them, and never upload
        refused.add(new W(Role.VENDOR, "POST", "/api/registers/empanel/rows", Map.of()));
        refused.add(new W(Role.VENDOR, "POST", "/api/registers/bills/rows", Map.of()));
        // a role cannot add records to registers it cannot open
        refused.add(new W(Role.FILM_SECTION, "POST", "/api/registers/rti/rows", Map.of()));
        refused.add(new W(Role.DEPT_NODAL, "POST", "/api/registers/film/rows", Map.of()));
        refused.add(new W(Role.JD_NEWS, "POST", "/api/registers/bills/rows", Map.of()));
        for (W w : refused) {
            int s = send(w.method(), w.path(), w.r(), w.body());
            if (s != 403) wrong.add(w.r() + " " + w.method() + " " + w.path() + " → " + s + " (want 403)");
        }
        assertThat(wrong).isEmpty();
    }

    /** Only the Commissioner and the Joint Director (News) publish a verdict; a DIO can take a claim up to Draft ready. */
    @Test
    void districtOfficerCannotPublishAVerdict() throws Exception {
        Map<String, Object> c = Map.of("text", "Raichur forward about Gruha Jyothi", "lang", "Kannada", "district", "Raichur", "category", "Scheme rumour");
        var res = mvc.perform(post("/api/tipline/claims").header("Authorization", auth(Role.DIO)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(c))).andReturn().getResponse();
        assertThat(res.getStatus()).isEqualTo(200);
        String id = json.readTree(res.getContentAsString()).get("id").asText();
        String path = "/api/tipline/claims/" + id + "/transition";
        assertThat(send("POST", path, Role.DIO, Map.of("to", "Triaged"))).isEqualTo(200);
        assertThat(send("POST", path, Role.DIO, Map.of("to", "Draft ready"))).isEqualTo(200);
        assertThat(send("POST", path, Role.DIO, Map.of("to", "Published"))).isEqualTo(403);
        assertThat(send("POST", path, Role.DD_ACCOUNTS, Map.of("to", "Published"))).isEqualTo(403);
        assertThat(send("POST", path, Role.JD_NEWS, Map.of("to", "Published"))).isEqualTo(200);
    }

    /** Scoped roles only ever receive their own rows. */
    @Test
    void scopedRolesSeeOnlyTheirRows() throws Exception {
        read("/api/spend/orders", Role.DIO).forEach(o -> assertThat(o.get("district").asText()).isEqualTo("Raichur"));
        read("/api/outreach/base", Role.DIO).forEach(o -> assertThat(o.get("district").asText()).isEqualTo("Raichur"));
        read("/api/tipline/claims", Role.DIO).forEach(o -> assertThat(o.get("district").asText()).isEqualTo("Raichur"));
        read("/api/offices/feed", Role.DIO).forEach(o -> assertThat(o.get("district").asText()).isEqualTo("Raichur"));
        read("/api/spend/orders", Role.DEPT_NODAL).forEach(o -> assertThat(o.get("department").asText()).isEqualTo("Health & Family Welfare"));
        read("/api/spend/budget", Role.DEPT_NODAL).forEach(o -> assertThat(o.get("department").asText()).isEqualTo("Health & Family Welfare"));
        read("/api/registers/bills/rows", Role.DEPT_NODAL).forEach(o -> {
            if (o.hasNonNull("department")) assertThat(o.get("department").asText()).isEqualTo("Health & Family Welfare");
        });
        JsonNode vo = read("/api/spend/orders", Role.VENDOR);
        assertThat(vo.size()).isPositive();
        vo.forEach(o -> assertThat(o.get("vendorId").asText()).isEqualTo("PR-K02"));
        read("/api/spend/vendors", Role.VENDOR).forEach(v -> assertThat(v.get("id").asText()).isEqualTo("PR-K02"));
        assertThat(read("/api/spend/budget", Role.VENDOR).size()).isZero();
        assertThat(read("/api/spend/budget", Role.DIO).size()).isZero();
    }
}
