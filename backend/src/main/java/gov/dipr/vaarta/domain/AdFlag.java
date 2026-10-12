package gov.dipr.vaarta.domain;

import jakarta.persistence.*;

import java.time.Instant;

/** A release order flagged by the Ad Spend Auditor. Nothing is withheld automatically; an officer decides. */
@Entity
@Table(name = "ad_flag")
public class AdFlag {
    @Id @Column(length = 30) public String ro;
    public String publication;
    @Column(length = 500) public String issue;
    public double amount;
    public String district;
    public String severity;
    public String reviewStatus;
    public String sentBy;
    public Instant sentAt;
}
