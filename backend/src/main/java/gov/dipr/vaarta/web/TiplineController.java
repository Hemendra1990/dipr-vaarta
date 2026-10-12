package gov.dipr.vaarta.web;

import gov.dipr.vaarta.domain.Claim;
import gov.dipr.vaarta.reference.ReferenceData;
import gov.dipr.vaarta.repo.ClaimRepo;
import gov.dipr.vaarta.security.CurrentUser;
import gov.dipr.vaarta.security.Role;
import gov.dipr.vaarta.domain.AuditEvent;
import gov.dipr.vaarta.repo.AuditEventRepo;
import gov.dipr.vaarta.service.AuditService;
import gov.dipr.vaarta.service.BotService;
import org.springframework.data.domain.Example;
import org.springframework.data.domain.ExampleMatcher;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Objects;
import java.util.Set;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/tipline")
public class TiplineController {
    private final ClaimRepo claims;
    private final ReferenceData ref;
    private final AuditService audit;
    private final AuditEventRepo auditLog;

    public TiplineController(ClaimRepo claims, ReferenceData ref, AuditService audit, AuditEventRepo auditLog) {
        this.claims = claims; this.ref = ref; this.audit = audit; this.auditLog = auditLog;
    }

    @GetMapping("/claims")
    public List<Claim> list(@AuthenticationPrincipal CurrentUser u) {
        u.requireAny("tipline", "ai");
        return claims.findAll().stream().filter(c -> u.districtOk(c.district))
                .sorted(Comparator.comparing((Claim c) -> c.receivedAt).reversed()).toList();
    }

    public record NewClaim(@NotBlank String text, @NotBlank String lang, @NotBlank String district, @NotBlank String category,
                           String source, Integer forwards) {}

    @PostMapping("/claims")
    @Transactional
    public Claim create(@AuthenticationPrincipal CurrentUser u, @RequestBody @Valid NewClaim req) {
        u.require("tipline");
        if (!ref.isDistrict(req.district())) throw new IllegalArgumentException("Unknown district " + req.district());
        if (!u.districtOk(req.district())) throw new CurrentUser.AccessDeniedException("This login covers " + u.district() + " district only.");
        if (!BotService.CATEGORIES.contains(req.category())) throw new IllegalArgumentException("Unknown claim type " + req.category());
        if (!languages().contains(req.lang())) throw new IllegalArgumentException("Unknown language " + req.lang());
        if (req.text().trim().length() > 1000) throw new IllegalArgumentException("Keep the claim under 1,000 characters.");
        if (req.forwards() != null && (req.forwards() < 0 || req.forwards() > 10_000_000)) throw new IllegalArgumentException("Forwards must be between 0 and 1,00,00,000.");
        if (req.source() != null && req.source().length() > 60) throw new IllegalArgumentException("Source is too long.");
        Claim c = new Claim();
        c.id = BotService.nextClaimId(claims);
        c.text = req.text().trim(); c.lang = req.lang(); c.district = req.district(); c.category = req.category();
        c.source = req.source() == null || req.source().isBlank() ? (u.district() != null ? "District office" : "Analytics team") : req.source();
        c.forwards = req.forwards() == null ? 0 : req.forwards();
        c.status = "New"; c.verdict = "—"; c.receivedAt = Instant.now(); c.updatedAt = c.receivedAt;
        c.createdBy = u.username();
        audit.record(u, "claim.create", c.id);
        return claims.save(c);
    }

    public record Transition(@NotBlank String to, String note) {}

    /** The claim workflow. Only the Commissioner and Joint Director (News) can approve and publish a verdict. */
    @PostMapping("/claims/{id}/transition")
    @Transactional
    public Claim transition(@AuthenticationPrincipal CurrentUser u, @PathVariable String id, @RequestBody @Valid Transition t) {
        u.require("tipline");
        Claim c = claims.findById(id).orElseThrow(() -> new NoSuchElementException("No claim " + id));
        if (!u.districtOk(c.district)) throw new CurrentUser.AccessDeniedException("This claim is outside your district.");
        Map<String, String> next = Map.of("New", "Triaged", "Triaged", "Draft ready", "Draft ready", "Published");
        String to = t.to();
        String note = t.note() == null ? "" : t.note().trim();
        if (note.length() > 500) throw new IllegalArgumentException("Keep the note under 500 characters.");
        if (to.equals("Closed")) {
            // Governance: claims not of public interest are closed without action; an escalated claim is closed once the
            // district administration has dealt with it.
            if (c.status.equals("Escalated")) c.verdict = "Handled by district administration";
            else if (Set.of("New", "Triaged", "Draft ready").contains(c.status)) c.verdict = "Not of public interest";
            else throw new IllegalArgumentException("A " + c.status + " claim cannot be closed.");
            if (!note.isEmpty()) c.clarification = note;
            c.approvedBy = u.displayName();
        } else if (to.equals("Escalated")) {
            if (c.status.equals("Published") || c.status.equals("Escalated")) throw new IllegalArgumentException("This claim can no longer be escalated.");
            c.verdict = "Routed to district administration";
        } else {
            if (!to.equals(next.get(c.status))) throw new IllegalArgumentException("A " + c.status + " claim cannot move to " + to + ".");
            if (to.equals("Draft ready") && "—".equals(c.verdict)) c.verdict = "Suggested: False";
            if (to.equals("Published")) {
                u.requireRole(Role.COMMISSIONER, Role.JD_NEWS);
                if (c.verdict == null || c.verdict.isBlank() || c.verdict.equals("—")) throw new IllegalArgumentException("Set a verdict before publishing.");
                c.verdict = c.verdict == null ? "False" : c.verdict.replace("Suggested: ", "");
                c.approvedBy = u.displayName();
            }
        }
        c.status = to;
        c.updatedAt = Instant.now();
        audit.record(u, "claim." + to, c.id + (note.isEmpty() ? "" : " · " + note));
        return c;
    }

    public record HistoryEntry(Instant at, String who, String action, String detail) {}

    public record ClaimDetail(Claim claim, List<HistoryEntry> history, List<Claim> related, boolean canEdit, boolean canPublish) {}

    /** One claim with its history (from the audit log) and the claims linked to it by duplicate matching. */
    @GetMapping("/claims/{id}")
    public ClaimDetail detail(@AuthenticationPrincipal CurrentUser u, @PathVariable String id) {
        u.requireAny("tipline", "ai");
        Claim c = find(u, id);
        AuditEvent probe = new AuditEvent(null, null, id);
        ExampleMatcher m = ExampleMatcher.matching().withIgnorePaths("id", "at")
                .withMatcher("detail", ExampleMatcher.GenericPropertyMatchers.startsWith());
        List<HistoryEntry> h = auditLog.findAll(Example.of(probe, m)).stream()
                .filter(e -> e.detail.equals(id) || e.detail.startsWith(id + " "))
                .sorted(Comparator.comparing((AuditEvent e) -> e.at))
                .map(e -> new HistoryEntry(e.at, e.username.startsWith("bot:") ? "WhatsApp bot" : e.username, e.action, e.detail))
                .toList();
        List<Claim> related = new ArrayList<>(claims.findByMatchOf(id));
        if (c.matchOf != null) claims.findById(c.matchOf).ifPresent(o -> related.add(0, o));
        return new ClaimDetail(c, h, related.stream().filter(x -> u.districtOk(x.district)).toList(), canEdit(u, c),
                u.role() == Role.COMMISSIONER || u.role() == Role.JD_NEWS);
    }

    public record Edit(String verdict, String category, String clarification) {}

    /**
     * Edit the verdict, category and clarification of a claim before it is published. Same people who can triage
     * (Commissioner, Joint Director (News), DIO for their district); publishing is still Commissioner / JD (News) only.
     */
    @PostMapping("/claims/{id}/edit")
    @Transactional
    public Claim edit(@AuthenticationPrincipal CurrentUser u, @PathVariable String id, @RequestBody Edit e) {
        u.require("tipline");
        Claim c = find(u, id);
        if (!canEdit(u, c)) throw new IllegalArgumentException("A " + c.status + " claim can no longer be edited.");
        List<String> changes = new ArrayList<>();
        if (e.verdict() != null) {
            String v = e.verdict().trim();
            if (v.isEmpty()) v = "—";
            if (v.length() > 120) throw new IllegalArgumentException("Keep the verdict under 120 characters.");
            if (!v.equals(c.verdict)) { changes.add("verdict: " + c.verdict + " → " + v); c.verdict = v; }
        }
        if (e.category() != null && !e.category().equals(c.category)) {
            if (!BotService.CATEGORIES.contains(e.category())) throw new IllegalArgumentException("Unknown claim type " + e.category());
            changes.add("type: " + c.category + " → " + e.category());
            c.category = e.category();
        }
        if (e.clarification() != null) {
            String t = e.clarification().trim();
            if (t.length() > 1000) throw new IllegalArgumentException("Keep the clarification under 1,000 characters.");
            if (!t.equals(Objects.toString(c.clarification, ""))) { changes.add("clarification updated"); c.clarification = t.isEmpty() ? null : t; }
        }
        if (changes.isEmpty()) return c;
        c.updatedAt = Instant.now();
        audit.record(u, "claim.edit", c.id + " · " + String.join("; ", changes));
        return c;
    }

    private Claim find(CurrentUser u, String id) {
        Claim c = claims.findById(id).orElseThrow(() -> new NoSuchElementException("No claim " + id));
        if (!u.districtOk(c.district)) throw new CurrentUser.AccessDeniedException("This claim is outside your district.");
        return c;
    }

    private static boolean canEdit(CurrentUser u, Claim c) {
        return u.can("tipline") && u.districtOk(c.district) && !Set.of("Published", "Escalated", "Closed").contains(c.status);
    }

    private List<String> languages() {
        List<String> out = new ArrayList<>();
        ref.reference().path("languages").forEach(n -> out.add(n.asText()));
        return out;
    }
}
