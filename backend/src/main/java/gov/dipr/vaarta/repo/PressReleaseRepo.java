package gov.dipr.vaarta.repo;

import gov.dipr.vaarta.domain.PressRelease;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PressReleaseRepo extends JpaRepository<PressRelease, String> {
    @Query("select count(p) from PressRelease p where p.status is null or p.status <> 'Draft'")
    long countIssued();

    /** Issued releases numbered from the prototype's oldest sample (REL-1859) up; the drill-down fill rows sit below it. */
    @Query("select count(p) from PressRelease p where (p.status is null or p.status <> 'Draft') and p.id >= 'REL-1859'")
    long countIssuedInSeries();

    /**
     * Next issued number, as the prototype's addRelease: REL-(1875 + releases issued so far), skipping any number in use.
     * Supplementary sample releases (REL-1858 and below, one per district the prototype had none for) do not count.
     */
    default String nextReleaseId() {
        long n = 1875 + countIssuedInSeries();
        while (existsById("REL-" + n)) n++;
        return "REL-" + n;
    }

    default String nextDraftId() {
        long n = 1 + count() - countIssued();
        while (existsById("DRF-" + n)) n++;
        return "DRF-" + n;
    }
}
