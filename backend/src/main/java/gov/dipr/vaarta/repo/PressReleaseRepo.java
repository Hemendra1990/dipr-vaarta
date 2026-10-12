package gov.dipr.vaarta.repo;

import gov.dipr.vaarta.domain.PressRelease;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PressReleaseRepo extends JpaRepository<PressRelease, String> {
}
