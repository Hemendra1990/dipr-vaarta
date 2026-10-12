package gov.dipr.vaarta.web;

import gov.dipr.vaarta.domain.Claim;
import gov.dipr.vaarta.reference.ReferenceData;
import gov.dipr.vaarta.repo.ClaimRepo;
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

@RestController
@RequestMapping("/api/tipline")
public class TiplineController {
    private final ClaimRepo claims;
    private final ReferenceData ref;
    private final AuditService audit;

    public TiplineController(ClaimRepo claims, ReferenceData ref, AuditService audit) {
        this.claims = claims; this.ref = ref; this.audit = audit;
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
        Claim c = new Claim();
        int next = claims.findAll().stream().map(x -> x.id).filter(id -> id.startsWith("IDTU-26-"))
                .mapToInt(id -> Integer.parseInt(id.substring(8))).max().orElse(4500) + 1;
        c.id = "IDTU-26-" + next;
        c.text = req.text().trim(); c.lang = req.lang(); c.district = req.district(); c.category = req.category();
        c.source = req.source() == null || req.source().isBlank() ? (u.district() != null ? "District office" : "Analytics team") : req.source();
        c.forwards = req.forwards() == null ? 0 : req.forwards();
        c.status = "New"; c.verdict = "—"; c.receivedAt = Instant.now(); c.updatedAt = c.receivedAt;
        audit.record(u, "claim.create", c.id);
        return claims.save(c);
    }

    public record Transition(@NotBlank String to) {}

    /** The claim workflow. Only the Commissioner and Joint Director (News) can approve and publish a verdict. */
    @PostMapping("/claims/{id}/transition")
    @Transactional
    public Claim transition(@AuthenticationPrincipal CurrentUser u, @PathVariable String id, @RequestBody @Valid Transition t) {
        u.require("tipline");
        Claim c = claims.findById(id).orElseThrow(() -> new NoSuchElementException("No claim " + id));
        if (!u.districtOk(c.district)) throw new CurrentUser.AccessDeniedException("This claim is outside your district.");
        Map<String, String> next = Map.of("New", "Triaged", "Triaged", "Draft ready", "Draft ready", "Published");
        String to = t.to();
        if (to.equals("Escalated")) {
            if (c.status.equals("Published") || c.status.equals("Escalated")) throw new IllegalArgumentException("This claim can no longer be escalated.");
            c.verdict = "Routed to district administration";
        } else {
            if (!to.equals(next.get(c.status))) throw new IllegalArgumentException("A " + c.status + " claim cannot move to " + to + ".");
            if (to.equals("Draft ready") && "—".equals(c.verdict)) c.verdict = "Suggested: False";
            if (to.equals("Published")) {
                u.requireRole(Role.COMMISSIONER, Role.JD_NEWS);
                c.verdict = c.verdict == null ? "False" : c.verdict.replace("Suggested: ", "");
                c.approvedBy = u.displayName();
            }
        }
        c.status = to;
        c.updatedAt = Instant.now();
        audit.record(u, "claim." + to, c.id);
        return c;
    }
}
