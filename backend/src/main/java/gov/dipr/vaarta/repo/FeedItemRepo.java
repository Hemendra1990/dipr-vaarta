package gov.dipr.vaarta.repo;

import gov.dipr.vaarta.domain.FeedItem;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FeedItemRepo extends JpaRepository<FeedItem, Long> {
}
