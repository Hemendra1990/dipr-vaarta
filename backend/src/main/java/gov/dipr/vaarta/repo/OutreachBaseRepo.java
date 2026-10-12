package gov.dipr.vaarta.repo;

import gov.dipr.vaarta.domain.OutreachBase;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface OutreachBaseRepo extends JpaRepository<OutreachBase, Long> {
    @Query("select o from OutreachBase o where (:district is null or o.district = :district) order by o.id")
    List<OutreachBase> findScoped(@Param("district") String district);
}
