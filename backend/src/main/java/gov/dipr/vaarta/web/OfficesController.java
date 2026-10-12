package gov.dipr.vaarta.web;

import gov.dipr.vaarta.domain.FeedItem;
import gov.dipr.vaarta.domain.OfficeTask;
import gov.dipr.vaarta.reference.ReferenceData;
import gov.dipr.vaarta.repo.FeedItemRepo;
import gov.dipr.vaarta.repo.OfficeTaskRepo;
import gov.dipr.vaarta.security.CurrentUser;
import gov.dipr.vaarta.security.Role;
import gov.dipr.vaarta.service.AuditService;
import gov.dipr.vaarta.service.Calendar;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Comparator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;

@RestController
@RequestMapping("/api/offices")
public class OfficesController {
    private final FeedItemRepo repo;
    private final OfficeTaskRepo tasks;
    private final ReferenceData ref;
    private final AuditService audit;
    private final Calendar cal;

    public OfficesController(FeedItemRepo repo, OfficeTaskRepo tasks, ReferenceData ref, AuditService audit, Calendar cal) {
        this.repo = repo; this.tasks = tasks; this.ref = ref; this.audit = audit; this.cal = cal;
    }

    @GetMapping("/feed")
    public List<FeedItem> feed(@AuthenticationPrincipal CurrentUser u) {
        u.require("offices");
        return repo.findAll().stream().filter(f -> u.districtOk(f.district))
                .sorted(Comparator.comparing((FeedItem f) -> f.createdAt).reversed()).toList();
    }

    public record NewItem(@NotBlank String type, String district, String scheme, String sentiment, @NotBlank String note) {}

    @PostMapping("/feed")
    public FeedItem post(@AuthenticationPrincipal CurrentUser u, @RequestBody @Valid NewItem req) {
        u.require("offices");
        if (!Set.of("pulse", "report", "esc", "rel").contains(req.type())) throw new IllegalArgumentException("Unknown update type");
        String dist = u.district() != null ? u.district() : req.district();
        if (dist == null || !ref.isDistrict(dist)) throw new IllegalArgumentException("Choose a district");
        String sent = blank(req.sentiment());
        if (sent != null && !Set.of("Positive", "Mixed", "Negative").contains(sent)) throw new IllegalArgumentException("Sentiment is Positive, Mixed or Negative.");
        String note = req.note().trim();
        if (note.length() > 1000) throw new IllegalArgumentException("Keep the update under 1,000 characters.");
        String scheme = blank(req.scheme());
        if (scheme != null && scheme.length() > 60) throw new IllegalArgumentException("Scheme name is too long.");
        FeedItem f = new FeedItem();
        f.type = req.type(); f.district = dist; f.scheme = scheme; f.sentiment = sent;
        f.note = note; f.author = u.displayName(); f.createdAt = Instant.now();
        f.channel = "Console"; f.createdBy = u.username();
        audit.record(u, "feed.post", f.type + " " + dist);
        return repo.save(f);
    }

    public record Resolve(String note) {}

    /** Close a citizen escalation: the DIO of that district or the Commissioner, with an optional short note. */
    @PostMapping("/feed/{id}/resolve")
    @Transactional
    public FeedItem resolve(@AuthenticationPrincipal CurrentUser u, @PathVariable Long id, @RequestBody(required = false) Resolve req) {
        u.require("offices");
        FeedItem f = repo.findById(id).orElseThrow(() -> new NoSuchElementException("No update " + id));
        if (!u.districtOk(f.district)) throw new CurrentUser.AccessDeniedException("This update is outside your district.");
        if (!"esc".equals(f.type)) throw new IllegalArgumentException("Only citizen escalations are resolved.");
        if (f.resolvedAt != null) throw new IllegalArgumentException("This escalation was already resolved by " + f.resolvedBy + ".");
        String note = req == null || req.note() == null ? "" : req.note().trim();
        if (note.length() > 500) throw new IllegalArgumentException("Keep the note under 500 characters.");
        f.resolvedBy = u.displayName(); f.resolvedAt = Instant.now(); f.resolution = note.isEmpty() ? null : note;
        audit.record(u, "feed.resolve", id + " " + f.district + (note.isEmpty() ? "" : " · " + note));
        return f;
    }

    /** HQ tasks of the offices in scope: open ones first by due date, then done ones (latest first). */
    @GetMapping("/tasks")
    public List<OfficeTask> tasks(@AuthenticationPrincipal CurrentUser u) {
        u.require("offices");
        return tasks.findAll().stream().filter(t -> u.districtOk(t.district))
                .sorted(Comparator.comparing((OfficeTask t) -> !"Open".equals(t.status))
                        .thenComparing(t -> "Open".equals(t.status) ? t.due : LocalDate.MAX)
                        .thenComparing(t -> t.doneAt == null ? Instant.MIN : t.doneAt, Comparator.reverseOrder()))
                .toList();
    }

    public record NewTask(@NotBlank String district, @NotBlank String title, @NotBlank String due) {}

    /** HQ (the Commissioner) gives a district office a task with a due date. */
    @PostMapping("/tasks")
    public OfficeTask assign(@AuthenticationPrincipal CurrentUser u, @RequestBody @Valid NewTask req) {
        u.require("offices");
        u.requireRole(Role.COMMISSIONER);
        if (!ref.isDistrict(req.district())) throw new IllegalArgumentException("Choose a district");
        String title = req.title().trim();
        if (title.length() > 200) throw new IllegalArgumentException("Keep the task under 200 characters.");
        LocalDate due;
        try { due = LocalDate.parse(req.due()); } catch (DateTimeParseException e) { throw new IllegalArgumentException("Due date: use YYYY-MM-DD."); }
        if (due.isBefore(cal.asOf().minusDays(30)) || due.isAfter(cal.asOf().plusYears(1))) throw new IllegalArgumentException("Pick a due date within the next year.");
        OfficeTask t = new OfficeTask();
        t.district = req.district(); t.title = title; t.due = due; t.status = "Open";
        t.assignedBy = u.displayName(); t.assignedAt = Instant.now();
        t = tasks.save(t);
        audit.record(u, "task.assign", t.id + " " + t.district + " · " + title);
        return t;
    }

    public record Done(String note) {}

    /** The district office (or the Commissioner) marks a task done. */
    @PostMapping("/tasks/{id}/done")
    @Transactional
    public OfficeTask done(@AuthenticationPrincipal CurrentUser u, @PathVariable Long id, @RequestBody(required = false) Done req) {
        u.require("offices");
        OfficeTask t = tasks.findById(id).orElseThrow(() -> new NoSuchElementException("No task " + id));
        if (!u.districtOk(t.district)) throw new CurrentUser.AccessDeniedException("This task is for another district.");
        if (!"Open".equals(t.status)) throw new IllegalArgumentException("This task is already done.");
        String note = req == null || req.note() == null ? "" : req.note().trim();
        if (note.length() > 500) throw new IllegalArgumentException("Keep the note under 500 characters.");
        t.status = "Done"; t.doneBy = u.displayName(); t.doneAt = Instant.now(); t.doneNote = note.isEmpty() ? null : note;
        audit.record(u, "task.done", t.id + " " + t.district + " · " + t.title);
        return t;
    }

    private static String blank(String s) { return s == null || s.isBlank() ? null : s.trim(); }
}
