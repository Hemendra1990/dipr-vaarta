package gov.dipr.vaarta.repo;

import gov.dipr.vaarta.domain.Claim;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface ClaimRepo extends JpaRepository<Claim, String> {
    List<Claim> findByReceivedAtAfterOrderByReceivedAtAsc(Instant since);
    List<Claim> findByStatus(String status);
    List<Claim> findByMatchOf(String id);
}
