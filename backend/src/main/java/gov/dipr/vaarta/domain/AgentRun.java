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
    /** The area in view when the run started (e.g. "Kalaburagi Division"). */
    public String area;
    /** District of the planner's target (taluk or district target); null for state/division targets. */
    public String targetDistrict;
    /** Who the approved output went to (Minister's office, Commissioner, Energy department, journalists ...). */
    public String sentTo;
    /** What approving changed, e.g. "REL-1875 issued" or "3 claims moved to Triaged: IDTU-...". */
    @Column(length = 2000) public String effect;
}
