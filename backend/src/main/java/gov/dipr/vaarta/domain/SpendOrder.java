package gov.dipr.vaarta.domain;

import jakarta.persistence.*;

/** One release order line: what DIPR bought, from whom, for which campaign, and its payment status. */
@Entity
@Table(name = "spend_order", indexes = {@Index(columnList = "district"), @Index(columnList = "department"), @Index(columnList = "vendorId")})
public class SpendOrder {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @Column(nullable = false, length = 40) public String roNo;
    @Column(length = 10) public String fy;
    @Column(name = "month_ym", length = 7) public String month;
    @Column(length = 2) public String quarter;
    public String campaignId;
    public String campaign;
    public String ctype;
    public String department;
    public String channel;
    public String vendorId;
    public String vendor;
    public String district;
    public double amount;
    public String status;
    public Long uploadId;

    // Workflow fields. Seeded and uploaded rows leave these empty.
    @Column(length = 60) public String issuedBy;
    @Column(length = 10) public String issuedOn;
    @Column(length = 40) public String billNo;
    public Double billAmount;
    @Column(length = 10) public String billDate;
    @Column(length = 10) public String paidOn;
    @Column(length = 60) public String paymentRef;
    /** JSON array of {at, by, action, note}, newest last. */
    @Column(length = 8000) public String history;
}
