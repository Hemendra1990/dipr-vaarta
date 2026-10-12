package gov.dipr.vaarta.domain;

import jakarta.persistence.*;

import java.time.Instant;

/**
 * A release order flagged by the Ad Spend Auditor. Review states: Flagged → Sent for review → Cleared | Payment withheld | Resolved
 * (a withheld order can later be Cleared or Resolved). Nothing is withheld automatically; an officer decides.
 */
@Entity
@Table(name = "ad_flag")
public class AdFlag {
    @Id @Column(length = 30) public String ro;
    public String publication;
    @Column(length = 500) public String issue;
    public double amount;
    public String district;
    /** One of the district's taluks (sample data, or when the sender names one); null for statewide items. */
    @Column(length = 60) public String taluk;
    public String severity;
    public String reviewStatus;
    public String sentBy;
    public Instant sentAt;
    /** Outcome recorded by the Deputy Director (Accounts): Cleared, Payment withheld or Resolved. */
    @Column(length = 500) public String outcomeNote;
    public String decidedBy;
    public Instant decidedAt;
}
