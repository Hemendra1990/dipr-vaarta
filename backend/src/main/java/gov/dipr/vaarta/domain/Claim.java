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
    public String category;
    public String status;
    public String verdict;
    public Instant receivedAt;
    public int forwards;
    public String source;
    public String approvedBy;
    public Instant updatedAt;
}
