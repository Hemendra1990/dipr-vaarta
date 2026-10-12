package gov.dipr.vaarta.repo;

import gov.dipr.vaarta.domain.AuditEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuditEventRepo extends JpaRepository<AuditEvent, Long> {
}
