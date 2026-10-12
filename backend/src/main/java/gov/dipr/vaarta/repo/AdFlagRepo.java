package gov.dipr.vaarta.repo;

import gov.dipr.vaarta.domain.AdFlag;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AdFlagRepo extends JpaRepository<AdFlag, String> {
}
