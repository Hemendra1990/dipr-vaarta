package gov.dipr.vaarta.repo;

import gov.dipr.vaarta.domain.OfficeTask;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OfficeTaskRepo extends JpaRepository<OfficeTask, Long> {
}
