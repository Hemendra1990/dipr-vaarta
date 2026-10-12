package gov.dipr.vaarta.domain;

import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "press_release")
public class PressRelease {
    @Id @Column(length = 30) public String id;
    @Column(length = 500) public String title;
    public String dept;
    /** District name, or "State" for statewide releases. */
    public String district;
    public double hoursAfterEvent;
    public int reach;
    public int kits;
    public int pickup;
    public Instant issuedAt;
}
