package gov.dipr.vaarta.domain;

import jakarta.persistence.*;

/** Taluk-level WhatsApp outreach base metrics; the dashboards slice and aggregate these. Metrics are JSON. */
@Entity
@Table(name = "outreach_base")
public class OutreachBase {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    public String district;
    public String taluk;
    @Lob public String metrics;
}
