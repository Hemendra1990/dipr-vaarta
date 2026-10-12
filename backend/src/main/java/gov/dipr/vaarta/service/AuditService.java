package gov.dipr.vaarta.service;

import gov.dipr.vaarta.domain.AuditEvent;
import gov.dipr.vaarta.repo.AuditEventRepo;
import gov.dipr.vaarta.security.CurrentUser;
import org.springframework.stereotype.Service;

@Service
public class AuditService {
    private final AuditEventRepo repo;

    public AuditService(AuditEventRepo repo) { this.repo = repo; }

    public void record(CurrentUser u, String action, String detail) {
        repo.save(new AuditEvent(u == null ? "anonymous" : u.username(), action, detail));
    }
}
