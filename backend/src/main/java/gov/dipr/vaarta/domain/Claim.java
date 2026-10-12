package gov.dipr.vaarta.domain;

import jakarta.persistence.*;

import java.time.Instant;

/** A tipline claim moving New → Triaged → Draft ready → Published, or Escalated. */
@Entity
@Table(name = "claim")
public class Claim {
    @Id @Column(length = 30) public String id;
    @Column(length = 1000) public String text;
    public String lang;
    public String district;
    /** One of the district's taluks (sample data, or when the sender names one); null for statewide items. */
    @Column(length = 60) public String taluk;
    public String category;
    public String status;
    public String verdict;
    public Instant receivedAt;
    public int forwards;
    public String source;
    public String approvedBy;
    public Instant updatedAt;
    /** Clarification text sent to people who forwarded the claim (editable before publishing). */
    @Column(length = 1000) public String clarification;
    /** For a tipline message that matched an already published claim: that claim's id. */
    @Column(length = 30) public String matchOf;
    /** Masked sender number for claims that came in over WhatsApp. */
    public String contact;
    /** Username (or bot:&lt;phone&gt;) that created the claim; used to skip your own items in live updates. */
    public String createdBy;
}
