package gov.dipr.vaarta.web;

import gov.dipr.vaarta.domain.AuditEvent;
import gov.dipr.vaarta.repo.AuditEventRepo;
import gov.dipr.vaarta.security.CurrentUser;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;

/** Audit log: every write in the portal, newest first. Commissioner only. */
@RestController
@RequestMapping("/api/audit")
public class AuditController {
    /** Days in the filter are Indian Standard Time days. */
    static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private final AuditEventRepo repo;

    public AuditController(AuditEventRepo repo) { this.repo = repo; }

    public record AuditRow(long id, String username, String action, String detail, Instant at) {}

    @GetMapping
    public Map<String, Object> list(@AuthenticationPrincipal CurrentUser cu,
                                    @RequestParam(required = false) String user, @RequestParam(required = false) String action,
                                    @RequestParam(required = false) String from, @RequestParam(required = false) String to,
                                    @RequestParam(required = false) String q,
                                    @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
        cu.require("audit");
        if (page < 0) throw new IllegalArgumentException("page must be 0 or more.");
        size = Math.max(1, Math.min(size, 200));
        Specification<AuditEvent> spec = (r, cq, cb) -> cb.conjunction();
        if (has(user)) spec = spec.and((r, cq, cb) -> cb.equal(cb.lower(r.get("username")), user.trim().toLowerCase()));
        if (has(action)) {
            // "user" matches user.create, user.update ...; an exact action matches itself
            String a = action.trim();
            spec = spec.and((r, cq, cb) -> cb.or(cb.equal(r.get("action"), a), cb.like(r.get("action"), a + ".%")));
        }
        if (has(q)) {
            String like = "%" + q.trim().toLowerCase().replace("%", "").replace("_", "") + "%";
            spec = spec.and((r, cq, cb) -> cb.like(cb.lower(r.get("detail")), like));
        }
        if (has(from)) {
            Instant f = day(from, "from").atStartOfDay(IST).toInstant();
            spec = spec.and((r, cq, cb) -> cb.greaterThanOrEqualTo(r.get("at"), f));
        }
        if (has(to)) {
            Instant t = day(to, "to").plusDays(1).atStartOfDay(IST).toInstant();
            spec = spec.and((r, cq, cb) -> cb.lessThan(r.get("at"), t));
        }
        Page<AuditEvent> p = repo.findAll(spec, PageRequest.of(page, size, Sort.by(Sort.Order.desc("at"), Sort.Order.desc("id"))));
        List<AuditRow> items = p.getContent().stream().map(e -> new AuditRow(e.id, e.username, e.action, e.detail, e.at)).toList();
        return Map.of("items", items, "total", p.getTotalElements(), "page", page, "size", size, "pages", p.getTotalPages());
    }

    /** Values for the filter drop-downs. */
    @GetMapping("/facets")
    public Map<String, Object> facets(@AuthenticationPrincipal CurrentUser cu) {
        cu.require("audit");
        List<String> actions = repo.distinctActions();
        List<String> groups = actions.stream().filter(a -> a.contains(".")).map(a -> a.substring(0, a.indexOf('.'))).distinct().sorted().toList();
        return Map.of("users", repo.distinctUsers(), "actions", actions, "groups", groups);
    }

    private static boolean has(String s) { return s != null && !s.isBlank(); }

    private static LocalDate day(String s, String name) {
        try {
            return LocalDate.parse(s.trim());
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException(name + " must be a date like 2026-10-07.");
        }
    }
}
