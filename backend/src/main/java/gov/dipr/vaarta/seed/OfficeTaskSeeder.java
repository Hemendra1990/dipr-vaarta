package gov.dipr.vaarta.seed;

import gov.dipr.vaarta.domain.OfficeTask;
import gov.dipr.vaarta.reference.ReferenceData;
import gov.dipr.vaarta.repo.OfficeTaskRepo;
import gov.dipr.vaarta.service.Calendar;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Gives every District Information Office the prototype's three "Open tasks from HQ" the first time the app starts,
 * with due dates relative to the as-of date (as-of + 3 days, + 5 days, and one already a day late).
 */
@Component
public class OfficeTaskSeeder {
    private static final Logger log = LoggerFactory.getLogger(OfficeTaskSeeder.class);
    private final OfficeTaskRepo tasks;
    private final ReferenceData ref;
    private final Calendar cal;

    public OfficeTaskSeeder(OfficeTaskRepo tasks, ReferenceData ref, Calendar cal) { this.tasks = tasks; this.ref = ref; this.cal = cal; }

    @EventListener(ApplicationReadyEvent.class)
    public void seed() {
        if (tasks.count() > 0) return;
        LocalDate t0 = cal.asOf();
        Object[][] proto = {{"Yuva Nidhi posters to 14 colleges", 3}, {"Press arrangements for minister's visit", 5}, {"Shakti campaign photos", -1}};
        List<OfficeTask> out = new ArrayList<>();
        for (String d : ref.districts()) {
            for (Object[] p : proto) {
                OfficeTask t = new OfficeTask();
                t.district = d; t.title = (String) p[0]; t.due = t0.plusDays((Integer) p[1]); t.status = "Open";
                t.assignedBy = "DIPR headquarters"; t.assignedAt = Instant.now();
                out.add(t);
            }
        }
        tasks.saveAll(out);
        log.info("Gave {} district offices their sample HQ tasks", ref.districts().size());
    }
}
