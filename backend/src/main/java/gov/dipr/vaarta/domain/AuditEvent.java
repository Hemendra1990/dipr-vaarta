package gov.dipr.vaarta.domain;

import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "audit_event")
public class AuditEvent {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    public String username;
    public String action;
    @Column(length = 2000) public String detail;
    public Instant at = Instant.now();

    protected AuditEvent() {}

    public AuditEvent(String username, String action, String detail) {
        this.username = username; this.action = action; this.detail = detail;
    }
}
