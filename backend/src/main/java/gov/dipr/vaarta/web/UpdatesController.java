package gov.dipr.vaarta.web;

import gov.dipr.vaarta.domain.Claim;
import gov.dipr.vaarta.domain.FeedItem;
import gov.dipr.vaarta.repo.ClaimRepo;
import gov.dipr.vaarta.repo.FeedItemRepo;
import gov.dipr.vaarta.security.CurrentUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Objects;

/**
 * Live updates for the console: claims and ground-feed items that arrived after {@code since}, in the user's scope,
 * leaving out the ones the user created. Without {@code since} it only returns the server time to start from.
 */
@RestController
public class UpdatesController {
    private final ClaimRepo claims;
    private final FeedItemRepo feed;

    public UpdatesController(ClaimRepo claims, FeedItemRepo feed) { this.claims = claims; this.feed = feed; }

    public record Updates(Instant now, List<Claim> claims, List<FeedItem> feed) {}

    @GetMapping("/api/updates")
    public Updates updates(@AuthenticationPrincipal CurrentUser u, @RequestParam(required = false) String since) {
        Instant now = Instant.now();
        if (since == null || since.isBlank()) return new Updates(now, List.of(), List.of());
        Instant from;
        try {
            from = Instant.parse(since);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("since: use an ISO time such as 2026-10-07T10:00:00Z");
        }
        // Never look back more than a day, so a stale tab does not flood the user.
        if (from.isBefore(now.minusSeconds(86_400))) from = now.minusSeconds(86_400);
        List<Claim> c = u.can("tipline")
                ? claims.findByReceivedAtAfterOrderByReceivedAtAsc(from).stream()
                    .filter(x -> u.districtOk(x.district) && !Objects.equals(x.createdBy, u.username())).limit(50).toList()
                : List.of();
        List<FeedItem> f = u.can("offices")
                ? feed.findByCreatedAtAfterOrderByCreatedAtAsc(from).stream()
                    .filter(x -> u.districtOk(x.district) && !Objects.equals(x.createdBy, u.username())).limit(50).toList()
                : List.of();
        return new Updates(now, c, f);
    }
}
