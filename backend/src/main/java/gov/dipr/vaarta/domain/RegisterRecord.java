package gov.dipr.vaarta.domain;

import jakarta.persistence.*;

import java.time.Instant;

/**
 * One row of a register (campaigns, bills, RTI ...). Field values live in {@code data} as JSON, shaped by the
 * register's schema; the scope columns are copied out so access filters run in SQL.
 */
@Entity
@Table(name = "register_record", indexes = {@Index(columnList = "registerId"), @Index(columnList = "registerId,district")})
public class RegisterRecord {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @Column(nullable = false, length = 40) public String registerId;
    public String district;
    public String department;
    public String vendorId;
    @Lob @Column(nullable = false) public String data;
    public Long uploadId;
    public Instant createdAt = Instant.now();
}
