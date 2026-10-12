package gov.dipr.vaarta.repo;

import gov.dipr.vaarta.domain.FeedItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface FeedItemRepo extends JpaRepository<FeedItem, Long> {
    List<FeedItem> findByCreatedAtAfterOrderByCreatedAtAsc(Instant since);
}
