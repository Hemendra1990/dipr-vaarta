package gov.dipr.vaarta.web;

import gov.dipr.vaarta.domain.AdFlag;
import gov.dipr.vaarta.repo.AdFlagRepo;
import gov.dipr.vaarta.security.CurrentUser;
import gov.dipr.vaarta.security.Role;
import gov.dipr.vaarta.service.AuditService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;

@RestController
@RequestMapping("/api/ads")
public class AdsController {
    /** Outcomes the Deputy Director (Accounts) can record, keyed by the value the client sends. */
    static final Map<String, String> OUTCOMES = Map.of("cleared", "Cleared", "withheld", "Payment withheld", "resolved", "Resolved");

    private final AdFlagRepo repo;
    private final AuditService audit;

    public AdsController(AdFlagRepo repo, AuditService audit) { this.repo = repo; this.audit = audit; }

    @GetMapping("/flags")
    public List<AdFlag> list(@AuthenticationPrincipal CurrentUser u) {
        u.requireAny("ads", "ai");
        return repo.findAll().stream().filter(f -> u.districtOk(f.district))
                .sorted(Comparator.comparing((AdFlag f) -> f.ro).reversed()).toList();
    }

    /** Sends a flagged order to the Deputy Director (Accounts). Payment is never stopped automatically. */
    public record ReviewRequest(@NotBlank String ro) {}

    /** The order number travels in the body because release-order numbers contain slashes (RO/2026/3312). */
    @PostMapping("/flags/review")
    @Transactional
    public AdFlag review(@AuthenticationPrincipal CurrentUser u, @RequestBody @Valid ReviewRequest req) {
        u.require("ads");
        AdFlag f = find(u, req.ro());
        if (f.reviewStatus != null && !"Flagged".equals(f.reviewStatus))
            throw new IllegalArgumentException(f.ro + " is already " + f.reviewStatus.toLowerCase() + ".");
        f.reviewStatus = "Sent for review";
        f.sentBy = u.displayName();
        f.sentAt = Instant.now();
        audit.record(u, "adflag.review", f.ro);
        return repo.save(f);
    }

    public record Decision(@NotBlank String ro, @NotBlank String outcome, String note) {}

    /**
     * The reviewer's outcome: cleared (no issue), payment withheld (needs a reason) or resolved (vendor corrected the
     * bill). Only the Deputy Director (Accounts), to whom the order was sent. A withheld order can later be cleared or resolved.
     */
    @PostMapping("/flags/decide")
    @Transactional
    public AdFlag decide(@AuthenticationPrincipal CurrentUser u, @RequestBody @Valid Decision req) {
        u.require("ads");
        u.requireRole(Role.DD_ACCOUNTS);
        AdFlag f = find(u, req.ro());
        String to = OUTCOMES.get(req.outcome());
        if (to == null) throw new IllegalArgumentException("Choose cleared, withheld or resolved.");
        if (!Set.of("Sent for review", "Payment withheld").contains(f.reviewStatus))
            throw new IllegalArgumentException(f.ro + " has to be sent for review first" + ("Flagged".equals(f.reviewStatus) || f.reviewStatus == null ? "." : "; it is already " + f.reviewStatus.toLowerCase() + "."));
        if (to.equals(f.reviewStatus)) throw new IllegalArgumentException(f.ro + " is already " + to.toLowerCase() + ".");
        String note = req.note() == null ? "" : req.note().trim();
        if (note.length() > 500) throw new IllegalArgumentException("Keep the note under 500 characters.");
        if (to.equals("Payment withheld") && note.isEmpty()) throw new IllegalArgumentException("Give a reason for withholding payment.");
        f.reviewStatus = to;
        f.outcomeNote = note.isEmpty() ? null : note;
        f.decidedBy = u.displayName();
        f.decidedAt = Instant.now();
        audit.record(u, "adflag." + req.outcome(), f.ro + (note.isEmpty() ? "" : " · " + note));
        return f;
    }

    private AdFlag find(CurrentUser u, String ro) {
        AdFlag f = repo.findById(ro.trim()).orElseThrow(() -> new NoSuchElementException("No flagged order " + ro));
        if (!u.districtOk(f.district)) throw new CurrentUser.AccessDeniedException("This order is outside your district.");
        return f;
    }
}
