package gov.dipr.vaarta.domain;

import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "press_release")
public class PressRelease {
    public static final String DRAFT = "Draft", ISSUED = "Issued";

    @Id @Column(length = 30) public String id;
    @Column(length = 500) public String title;
    public String dept;
    /** District name, or "State" for statewide releases. */
    public String district;
    public double hoursAfterEvent;
    public int reach;
    public int kits;
    public int pickup;
    /** Null while a draft. */
    public Instant issuedAt;
    /** Draft or Issued. Rows from before this column existed (null) count as issued. */
    @Column(length = 12) public String status = ISSUED;
    /** Kannada or English. */
    @Column(length = 20) public String language;
    @Column(length = 20000) public String body;
    public String draftedBy;
    public Instant draftedAt;
    /** Display name of the Commissioner or Joint Director who approved it. */
    public String approvedBy;

    public boolean draft() { return DRAFT.equals(status); }
}
