package gov.dipr.vaarta.repo;

import gov.dipr.vaarta.domain.Vendor;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VendorRepo extends JpaRepository<Vendor, String> {
}
