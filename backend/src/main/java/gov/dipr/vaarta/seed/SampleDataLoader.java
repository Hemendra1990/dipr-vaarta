package gov.dipr.vaarta.seed;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import gov.dipr.vaarta.config.VaartaProperties;
import gov.dipr.vaarta.domain.*;
import gov.dipr.vaarta.repo.*;
import gov.dipr.vaarta.security.Role;
import gov.dipr.vaarta.service.RecordMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Loads the demo users and the prototype's sample data into an empty database. The JSON files are produced by
 * tools/dump-seed.js from the prototype's own generators, so the numbers match the prototype.
 */
@Component
public class SampleDataLoader implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(SampleDataLoader.class);

    private final VaartaProperties props;
    private final ObjectMapper om;
    private final PasswordEncoder encoder;
    private final TransactionTemplate tx;
    private final AppUserRepo users;
    private final SpendOrderRepo spend;
    private final BudgetLineRepo budget;
    private final VendorRepo vendors;
    private final RegisterRecordRepo records;
    private final ClaimRepo claims;
    private final PressReleaseRepo releases;
    private final FeedItemRepo feed;
    private final AdFlagRepo flags;
    private final OutreachBaseRepo outreach;
    private final RecordMapper mapper;

    public SampleDataLoader(VaartaProperties props, ObjectMapper om, PasswordEncoder encoder, TransactionTemplate tx, AppUserRepo users,
                            SpendOrderRepo spend, BudgetLineRepo budget, VendorRepo vendors, RegisterRecordRepo records, ClaimRepo claims,
                            PressReleaseRepo releases, FeedItemRepo feed, AdFlagRepo flags, OutreachBaseRepo outreach, RecordMapper mapper) {
        this.props = props; this.om = om; this.encoder = encoder; this.tx = tx; this.users = users; this.spend = spend; this.budget = budget;
        this.vendors = vendors; this.records = records; this.claims = claims; this.releases = releases; this.feed = feed; this.flags = flags;
        this.outreach = outreach; this.mapper = mapper;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        if (users.count() == 0) seedUsers();
        if (props.seedSampleData() && spend.count() == 0 && records.count() == 0) {
            tx.executeWithoutResult(s -> {
                try {
                    seedData();
                } catch (IOException e) {
                    throw new IllegalStateException("Could not load sample data", e);
                }
            });
        }
    }

    private void seedUsers() {
        String pw = encoder.encode(props.demoPassword());
        users.saveAll(List.of(
                new AppUser("commr.dipr", pw, Role.COMMISSIONER, "Commissioner, DIPR", "All of Karnataka · every wing", null, null, null),
                new AppUser("jd.news", pw, Role.JD_NEWS, "Joint Director (News)", "Karnataka · news, media, outreach", null, null, null),
                new AppUser("dd.accounts", pw, Role.DD_ACCOUNTS, "Deputy Director (Accounts)", "Karnataka · spend, empanelment, bills", null, null, null),
                new AppUser("dio.raichur", pw, Role.DIO, "DIO, Raichur", "Raichur district only", "Raichur", null, null),
                new AppUser("nodal.health", pw, Role.DEPT_NODAL, "Nodal Officer, Health", "Health & Family Welfare campaigns", null, "Health & Family Welfare", null),
                new AppUser("vendor.prk02", pw, Role.VENDOR, "PR-K02 · Kannada daily", "PR-K02 · own orders and bills", null, null, "PR-K02"),
                new AppUser("film.section", pw, Role.FILM_SECTION, "Film & Academies Section", "Film, academies, publications, archive", null, null, null)));
        log.info("Created {} demo users", users.count());
    }

    private <T> T read(String name, TypeReference<T> t) throws IOException {
        try (InputStream in = new ClassPathResource("seed/" + name).getInputStream()) {
            return om.readValue(in, t);
        }
    }

    private void seedData() throws IOException {
        Instant now = Instant.now();
        List<Map<String, Object>> sp = read("spend.json", new TypeReference<>() {});
        List<SpendOrder> orders = new ArrayList<>(sp.size());
        for (Map<String, Object> m : sp) orders.add(mapper.toSpend(m));
        spend.saveAll(orders);

        List<Map<String, Object>> bd = read("budget.json", new TypeReference<>() {});
        budget.saveAll(bd.stream().map(mapper::toBudget).toList());

        vendors.saveAll(read("vendors.json", new TypeReference<List<Vendor>>() {}));

        Map<String, List<Map<String, Object>>> recs = read("records.json", new TypeReference<>() {});
        List<RegisterRecord> rr = new ArrayList<>();
        recs.forEach((reg, rows) -> rows.forEach(r -> rr.add(mapper.toRecord(reg, r, null))));
        records.saveAll(rr);

        List<Map<String, Object>> base = read("outreach-base.json", new TypeReference<>() {});
        for (Map<String, Object> b : base) {
            OutreachBase o = new OutreachBase();
            o.district = (String) b.remove("district");
            o.taluk = (String) b.remove("taluk");
            o.metrics = om.writeValueAsString(b);
            outreach.save(o);
        }

        List<Map<String, Object>> cl = read("claims.json", new TypeReference<>() {});
        for (Map<String, Object> m : cl) {
            Claim c = new Claim();
            c.id = (String) m.get("id"); c.text = (String) m.get("text"); c.lang = (String) m.get("lang");
            c.district = (String) m.get("dist"); c.taluk = (String) m.get("taluk"); c.category = (String) m.get("cat"); c.status = (String) m.get("status");
            c.verdict = (String) m.get("verdict"); c.forwards = ((Number) m.get("fw")).intValue(); c.source = (String) m.get("src");
            c.receivedAt = now.minus(Math.round(((Number) m.get("ageHours")).doubleValue() * 60), ChronoUnit.MINUTES);
            c.updatedAt = c.receivedAt;
            claims.save(c);
        }

        List<Map<String, Object>> rl = read("releases.json", new TypeReference<>() {});
        for (int i = 0; i < rl.size(); i++) {
            Map<String, Object> m = rl.get(i);
            PressRelease p = new PressRelease();
            p.id = (String) m.get("id"); p.title = (String) m.get("title"); p.dept = (String) m.get("dept"); p.district = (String) m.get("dist"); p.taluk = (String) m.get("taluk");
            p.hoursAfterEvent = ((Number) m.get("h")).doubleValue(); p.reach = ((Number) m.get("reach")).intValue();
            p.kits = ((Number) m.get("kits")).intValue(); p.pickup = ((Number) m.get("pick")).intValue();
            // Prototype releases are 6 hours apart, newest first; supplementary ones carry their own age.
            p.issuedAt = m.get("ageHours") instanceof Number h ? now.minus(h.longValue(), ChronoUnit.HOURS) : now.minus(6L * (i + 1), ChronoUnit.HOURS);
            releases.save(p);
        }

        List<Map<String, Object>> fd = read("feed.json", new TypeReference<>() {});
        for (Map<String, Object> m : fd) {
            FeedItem f = new FeedItem();
            f.type = (String) m.get("t"); f.district = (String) m.get("dist"); f.taluk = (String) m.get("taluk"); f.scheme = (String) m.get("scheme");
            f.sentiment = (String) m.get("sent"); f.note = (String) m.get("note"); f.author = "DIO, " + f.district;
            f.createdAt = now.minus(((Number) m.get("ageHours")).longValue(), ChronoUnit.HOURS);
            feed.save(f);
        }

        List<Map<String, Object>> af = read("ad-flags.json", new TypeReference<>() {});
        for (Map<String, Object> m : af) {
            AdFlag a = new AdFlag();
            a.ro = (String) m.get("ro"); a.publication = (String) m.get("pub"); a.issue = (String) m.get("issue");
            a.amount = ((Number) m.get("amt")).doubleValue(); a.district = (String) m.get("dist"); a.taluk = (String) m.get("taluk"); a.severity = (String) m.get("sev");
            a.reviewStatus = "Flagged";
            flags.save(a);
        }
        log.info("Loaded sample data: {} release orders, {} register records", orders.size(), rr.size());
    }
}
