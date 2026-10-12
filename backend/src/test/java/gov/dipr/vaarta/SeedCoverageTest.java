package gov.dipr.vaarta;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import gov.dipr.vaarta.domain.RegisterRecord;
import gov.dipr.vaarta.domain.SpendOrder;
import gov.dipr.vaarta.reference.FieldDef;
import gov.dipr.vaarta.reference.ReferenceData;
import gov.dipr.vaarta.reference.RegisterDef;
import gov.dipr.vaarta.repo.*;
import gov.dipr.vaarta.security.JwtService;
import gov.dipr.vaarta.security.Role;
import gov.dipr.vaarta.service.RecordMapper;
import gov.dipr.vaarta.upload.FieldCoercer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import java.util.*;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The round-3 drill-down data contract: after the sample data loads, every district has rows in every district-tagged
 * dataset, every taluk has register records and release orders, and every taluk value belongs to its row's district.
 */
@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:vaarta-seedcov;DB_CLOSE_DELAY=-1", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class SeedCoverageTest {
    /** One District Information Office per district, filed under the headquarters taluk: filled per district only. */
    static final Set<String> NO_TALUK_FILL = Set.of("admin");
    static final String HEALTH = "Health & Family Welfare";

    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired ObjectMapper json;
    @Autowired ReferenceData ref;
    @Autowired RecordMapper mapper;
    @Autowired RegisterRecordRepo records;
    @Autowired SpendOrderRepo spend;
    @Autowired ClaimRepo claims;
    @Autowired FeedItemRepo feed;
    @Autowired AdFlagRepo flags;
    @Autowired PressReleaseRepo releases;

    private String commr() { return "Bearer " + jwt.issue("commr.dipr", Role.COMMISSIONER); }

    private JsonNode read(String path) throws Exception {
        return json.readTree(mvc.perform(get(path).header("Authorization", commr())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private static boolean statewide(String d) { return d == null || d.equals("Statewide") || d.equals("State"); }

    private List<String> allTaluks() {
        List<String> out = new ArrayList<>();
        ref.taluks().forEach((d, ts) -> ts.forEach(t -> out.add(d + "|" + t)));
        return out;
    }

    /** Checks every row's taluk belongs to its district (statewide rows have none) and returns the district and district|taluk keys seen. */
    private <T> Set<String> keys(String what, Collection<T> rows, Function<T, String> dist, Function<T, String> taluk) {
        Set<String> seen = new HashSet<>();
        for (T r : rows) {
            String d = dist.apply(r), t = taluk.apply(r);
            if (statewide(d)) {
                assertThat(t).as(what + ": statewide row has no taluk").isNull();
                continue;
            }
            assertThat(ref.isDistrict(d)).as(what + ": known district " + d).isTrue();
            seen.add(d);
            if (t != null) {
                assertThat(ref.taluksOf(d)).as(what + ": " + t + " is a taluk of " + d).contains(t);
                seen.add(d + "|" + t);
            }
        }
        return seen;
    }

    private String talukOf(RegisterRecord r) {
        Object t = mapper.fromRecord(r).get("taluk");
        return t == null || "".equals(t) ? null : t.toString();
    }

    @Test
    void everyDistrictAndTalukHasRegisterRecords() {
        Set<String> all = new HashSet<>();
        for (RegisterDef def : ref.registers()) {
            if (def.geoAll()) continue;
            List<RegisterRecord> rows = records.findScoped(def.id(), null, null, null);
            Set<String> seen = keys("register " + def.id(), rows, r -> r.district, this::talukOf);
            all.addAll(seen);
            assertThat(seen).as(def.id() + " has rows in every district").containsAll(ref.districts());
            // every district-tagged row carries a taluk
            rows.stream().filter(r -> !statewide(r.district)).forEach(r -> assertThat(talukOf(r)).as(def.id() + " row " + r.id + " has a taluk").isNotNull());
            if (!NO_TALUK_FILL.contains(def.id())) assertThat(seen).as(def.id() + " has rows in every taluk").containsAll(allTaluks());
            // the seed-only marker never reaches stored rows
            rows.forEach(r -> assertThat(mapper.fromRecord(r)).doesNotContainKey("supplementary"));
        }
        assertThat(all).as("register records in every taluk").containsAll(allTaluks());
    }

    @Test
    void everyDistrictAndTalukHasReleaseOrders() {
        List<SpendOrder> rows = spend.findAll();
        Set<String> seen = keys("spend", rows, o -> o.district, o -> o.taluk);
        assertThat(seen).containsAll(ref.districts());
        assertThat(seen).containsAll(allTaluks());
        rows.stream().filter(o -> !statewide(o.district)).forEach(o -> assertThat(o.taluk).as(o.roNo + " has a taluk").isNotNull());
    }

    @Test
    void everyDistrictHasLiveItemsWithValidTaluks() {
        Set<String> c = keys("claims", claims.findAll(), x -> x.district, x -> x.taluk);
        Set<String> f = keys("feed", feed.findAll(), x -> x.district, x -> x.taluk);
        Set<String> a = keys("ad flags", flags.findAll(), x -> x.district, x -> x.taluk);
        Set<String> p = keys("releases", releases.findAll(), x -> x.district, x -> x.taluk);
        for (Set<String> s : List.of(c, f, a, p)) assertThat(s).containsAll(ref.districts()).containsAll(allTaluks());
        // the fill rows are settled, so the live queues keep the prototype's counts
        assertThat(claims.findAll().stream().filter(x -> !Set.of("Published", "Closed").contains(x.status))).hasSize(7);
        assertThat(feed.findAll().stream().filter(x -> "pulse".equals(x.type))).hasSize(3);
        assertThat(feed.findAll().stream().filter(x -> "esc".equals(x.type))).hasSize(1);
        assertThat(flags.findAll().stream().filter(x -> "Flagged".equals(x.reviewStatus))).hasSize(5);
        assertThat(flags.findAll()).allSatisfy(x -> { if (!"Flagged".equals(x.reviewStatus)) assertThat(x.decidedBy).isNotNull(); });
        // the prototype's own rows keep their place: Raichur's pulse names Sindhanur, the Manvi escalation stays in Manvi
        assertThat(feed.findAll()).anySatisfy(x -> { assertThat(x.note).contains("Sindhanur"); assertThat(x.taluk).isEqualTo("Sindhanur"); });
        assertThat(feed.findAll()).anySatisfy(x -> { assertThat(x.note).contains("(Manvi)"); assertThat(x.taluk).isEqualTo("Manvi"); });
    }

    @Test
    void healthHasSpendBillsAndMediaInEveryTaluk() {
        // booked Health orders in April to September of the current year (like-for-like months) in every taluk
        Set<String> sp = keys("health spend", spend.findAll().stream().filter(o -> HEALTH.equals(o.department) && o.booked()
                && "2026-27".equals(o.fy) && o.month.compareTo("2026-04") >= 0 && o.month.compareTo("2026-09") <= 0).toList(), o -> o.district, o -> o.taluk);
        assertThat(sp).containsAll(allTaluks());
        for (String reg : List.of("bills", "media")) {
            Set<String> seen = keys("health " + reg, records.findScoped(reg, null, HEALTH, null), r -> r.district, this::talukOf);
            assertThat(seen).as("Health " + reg + " in every taluk").containsAll(allTaluks());
        }
    }

    @Test
    void stateSpendTotalsAreThePrototypes() {
        // the Health fill and PR-K02's district editions are paid for out of statewide orders, so these stay as generated
        double total = spend.findAll().stream().mapToDouble(o -> o.amount).sum();
        double health = spend.findAll().stream().filter(o -> HEALTH.equals(o.department)).mapToDouble(o -> o.amount).sum();
        double k02 = spend.findAll().stream().filter(o -> "PR-K02".equals(o.vendorId)).mapToDouble(o -> o.amount).sum();
        assertThat(total).isCloseTo(67816.80, org.assertj.core.data.Offset.offset(0.05));
        assertThat(health).isCloseTo(5167.61, org.assertj.core.data.Offset.offset(0.05));
        assertThat(k02).isCloseTo(3004.98, org.assertj.core.data.Offset.offset(0.05));
        // every district has an order awaiting payment (the payer's default status)
        Set<String> billed = new HashSet<>();
        spend.findAll().stream().filter(o -> "Billed".equals(o.status)).forEach(o -> billed.add(o.district));
        assertThat(billed).containsAll(ref.districts());
    }

    @Test
    void theDemoVendorHasDistrictOrdersAndBillsInEveryDivision() {
        Set<String> divs = new HashSet<>(), billDivs = new HashSet<>();
        spend.findAll().stream().filter(o -> "PR-K02".equals(o.vendorId) && !statewide(o.district)).forEach(o -> {
            divs.add(ref.divisionOf(o.district));
            assertThat(o.taluk).isNotNull();
        });
        records.findScoped("bills", null, null, "PR-K02").stream().filter(r -> !statewide(r.district)).forEach(r -> billDivs.add(ref.divisionOf(r.district)));
        Set<String> all = new HashSet<>();
        ref.districts().forEach(d -> all.add(ref.divisionOf(d)));
        assertThat(divs).isEqualTo(all);
        assertThat(billDivs).isEqualTo(all);
    }

    @Test
    void apisReturnTheTaluk() throws Exception {
        JsonNode orders = read("/api/spend/orders");
        assertThat(orders).anySatisfy(o -> assertThat(o.path("taluk").isTextual()).isTrue());
        for (JsonNode o : orders) {
            if (statewide(o.get("district").asText())) assertThat(o.path("taluk").isTextual()).isFalse();
            assertThat(o.has("supplementary")).isFalse();
        }
        for (String path : List.of("/api/tipline/claims", "/api/offices/feed", "/api/ads/flags", "/api/press/releases", "/api/registers/rti/rows")) {
            JsonNode rows = read(path);
            assertThat(rows).as(path).anySatisfy(r -> assertThat(r.path("taluk").isTextual()).isTrue());
            rows.forEach(r -> assertThat(r.has("supplementary")).as(path).isFalse());
        }
    }

    @Test
    void newReleaseNumbersFollowThePrototype() {
        // six prototype releases are issued, so the next one is REL-1881 as in the prototype; the fill rows do not count
        assertThat(releases.nextReleaseId()).isEqualTo("REL-1881");
    }

    @Test
    void uploadsCheckTheTalukAgainstTheRowsDistrict() {
        FieldCoercer c = new FieldCoercer(ref.districts(), ref.taluks());
        FieldDef f = ref.dataset("spend").orElseThrow().schema().stream().filter(x -> x.k().equals("taluk")).findFirst().orElseThrow();
        assertThat(f.req()).isFalse();
        assertThat(c.coerce(f, "", Map.of("district", "Raichur")).ok()).isTrue();
        assertThat(c.coerce(f, " manvi ", Map.of("district", "Raichur")).value()).isEqualTo("Manvi");
        assertThat(c.coerce(f, "Gokak", Map.of("district", "Raichur")).message()).isEqualTo("Not a taluk of Raichur");
        assertThat(c.coerce(f, "Manvi", Map.of("district", "Statewide")).ok()).isFalse();
        // the field and folk register's own taluk column uses the same check
        FieldDef ft = ref.register("field").orElseThrow().schema().stream().filter(x -> x.k().equals("taluk")).findFirst().orElseThrow();
        assertThat(ft.t()).isEqualTo("taluk");
        assertThat(c.coerce(ft, "Sindhanur", Map.of("district", "Raichur")).ok()).isTrue();
    }

    @Test
    void aStaleTalukIsDroppedWhenTheDistrictChanges() {
        Map<String, Object> row = new LinkedHashMap<>(Map.of("rtiId", "RTI-X", "district", "Belagavi", "taluk", "Manvi"));
        assertThat(mapper.fromRecord(mapper.toRecord("rti", row, null))).doesNotContainKey("taluk");
        Map<String, Object> ok = new LinkedHashMap<>(Map.of("rtiId", "RTI-Y", "district", "Raichur", "taluk", "manvi"));
        assertThat(mapper.fromRecord(mapper.toRecord("rti", ok, null))).containsEntry("taluk", "Manvi");
        Map<String, Object> field = new LinkedHashMap<>(Map.of("showId", "FS-X", "district", "Belagavi", "taluk", "Manvi"));
        assertThatThrownBy(() -> mapper.toRecord("field", field, null)).isInstanceOf(IllegalArgumentException.class);
        Map<String, Object> sp = new LinkedHashMap<>(Map.of("roNo", "RO/26/99999", "month", "2026-09", "district", "Raichur", "taluk", "Gokak"));
        assertThat(mapper.toSpend(sp).taluk).isNull();
    }
}
