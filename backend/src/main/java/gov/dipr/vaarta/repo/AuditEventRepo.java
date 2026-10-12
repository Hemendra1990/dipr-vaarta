package gov.dipr.vaarta.repo;

import gov.dipr.vaarta.domain.AuditEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface AuditEventRepo extends JpaRepository<AuditEvent, Long>, JpaSpecificationExecutor<AuditEvent> {
    @Query("select distinct e.action from AuditEvent e order by e.action")
    List<String> distinctActions();

    @Query("select distinct e.username from AuditEvent e order by e.username")
    List<String> distinctUsers();
}
