package gov.dipr.vaarta.domain;

import jakarta.persistence.*;

/** Media vendor directory used by spend analytics (kind and home district of each vendor code). */
@Entity
@Table(name = "vendor")
public class Vendor {
    @Id @Column(length = 20) public String id;
    public String kind;
    public String channel;
    public String district;
    public String language;
    public String name;
}
