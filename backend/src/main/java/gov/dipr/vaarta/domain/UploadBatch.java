package gov.dipr.vaarta.domain;

import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "upload_batch")
public class UploadBatch {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    public String dataset;
    public String datasetTitle;
    public String fileName;
    public String mode;
    public int rowsImported;
    public int rowsSkipped;
    public String uploadedBy;
    public String uploadedByTitle;
    public Instant uploadedAt;
}
