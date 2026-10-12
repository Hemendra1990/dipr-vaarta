package gov.dipr.vaarta.web;

import gov.dipr.vaarta.domain.FeedItem;
import gov.dipr.vaarta.reference.ReferenceData;
import gov.dipr.vaarta.repo.FeedItemRepo;
import gov.dipr.vaarta.security.CurrentUser;
import gov.dipr.vaarta.service.AuditService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

@RestController
@RequestMapping("/api/offices")
public class OfficesController {
    private final FeedItemRepo repo;
    private final ReferenceData ref;
    private final AuditService audit;

    public OfficesController(FeedItemRepo repo, ReferenceData ref, AuditService audit) { this.repo = repo; this.ref = ref; this.audit = audit; }

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
        FeedItem f = new FeedItem();
        f.type = req.type(); f.district = dist; f.scheme = blank(req.scheme()); f.sentiment = blank(req.sentiment());
        f.note = req.note().trim(); f.author = u.displayName(); f.createdAt = Instant.now();
        audit.record(u, "feed.post", f.type + " " + dist);
        return repo.save(f);
    }

    private static String blank(String s) { return s == null || s.isBlank() ? null : s; }
}
