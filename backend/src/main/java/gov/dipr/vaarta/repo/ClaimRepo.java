package gov.dipr.vaarta.repo;

import gov.dipr.vaarta.domain.Claim;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClaimRepo extends JpaRepository<Claim, String> {
}
