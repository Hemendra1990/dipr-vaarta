package gov.dipr.vaarta.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "budget_line")
public class BudgetLine {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @Column(length = 10) public String fy;
    public String department;
    public String channel;
    public double budget;
    public Long uploadId;
}
