package gov.dipr.vaarta.domain;

import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "agent_run")
public class AgentRun {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    public String agentId;
    public String target;
    /** Needs approval, Approved, Sent back. */
    public String status;
    @Lob public String steps;
    @Lob public String output;
    public String approveLabel;
    public String startedBy;
    public Instant startedAt;
    public String decidedBy;
    public Instant decidedAt;
    @Column(length = 1000) public String comment;
}
