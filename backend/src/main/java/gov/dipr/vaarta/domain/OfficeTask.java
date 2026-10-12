package gov.dipr.vaarta.domain;

import jakarta.persistence.*;

import java.time.Instant;
import java.time.LocalDate;

/** A task HQ gives a District Information Office ("Open tasks from HQ"). Open → Done. */
@Entity
@Table(name = "office_task")
public class OfficeTask {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    public String district;
    @Column(length = 200) public String title;
    public LocalDate due;
    @Column(length = 10) public String status;
    public String assignedBy;
    public Instant assignedAt;
    public String doneBy;
    public Instant doneAt;
    @Column(length = 500) public String doneNote;
}
