package gov.dipr.vaarta.web;

import gov.dipr.vaarta.domain.AdFlag;
import gov.dipr.vaarta.repo.AdFlagRepo;
import gov.dipr.vaarta.security.CurrentUser;
import gov.dipr.vaarta.service.AuditService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/ads")
public class AdsController {
    private final AdFlagRepo repo;
    private final AuditService audit;

    public AdsController(AdFlagRepo repo, AuditService audit) { this.repo = repo; this.audit = audit; }

    @GetMapping("/flags")
    public List<AdFlag> list(@AuthenticationPrincipal CurrentUser u) {
        u.requireAny("ads", "ai");
        return repo.findAll().stream().filter(f -> u.districtOk(f.district)).toList();
    }

    /** Sends a flagged order to the Deputy Director (Accounts). Payment is never stopped automatically. */
    @PostMapping("/flags/{ro}/review")
    @Transactional
    public AdFlag review(@AuthenticationPrincipal CurrentUser u, @PathVariable String ro) {
        u.require("ads");
        AdFlag f = repo.findAll().stream().filter(x -> x.ro.equals(ro)).findFirst().orElseThrow(() -> new NoSuchElementException("No flag " + ro));
        f.reviewStatus = "Sent for review";
        f.sentBy = u.displayName();
        f.sentAt = Instant.now();
        audit.record(u, "adflag.review", ro);
        return repo.save(f);
    }
}
