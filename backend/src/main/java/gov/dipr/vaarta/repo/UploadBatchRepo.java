package gov.dipr.vaarta.repo;

import gov.dipr.vaarta.domain.UploadBatch;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UploadBatchRepo extends JpaRepository<UploadBatch, Long> {
    List<UploadBatch> findTop50ByOrderByUploadedAtDesc();
    Optional<UploadBatch> findTopByDatasetOrderByUploadedAtDesc(String dataset);
}
